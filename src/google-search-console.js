const SCOPE="https://www.googleapis.com/auth/webmasters.readonly";
function b64url(input){
 const bytes=input instanceof Uint8Array?input:new TextEncoder().encode(input);
 let s="";for(const b of bytes)s+=String.fromCharCode(b);
 return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function pemBytes(pem){
 const raw=String(pem||"").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g,"");
 const bin=atob(raw),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;
}
async function accessToken(env){
 const email=String(env.GSC_CLIENT_EMAIL||"").trim(),key=String(env.GSC_PRIVATE_KEY||"").replace(/\\n/g,"\n").trim();
 if(!email||!key)throw new Error("Google Search Console belum dikonfigurasi");
 const now=Math.floor(Date.now()/1000),header=b64url(JSON.stringify({alg:"RS256",typ:"JWT"}));
 const payload=b64url(JSON.stringify({iss:email,scope:SCOPE,aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3500}));
 const unsigned=header+"."+payload;
 const cryptoKey=await crypto.subtle.importKey("pkcs8",pemBytes(key),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
 const sig=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",cryptoKey,new TextEncoder().encode(unsigned));
 const assertion=unsigned+"."+b64url(new Uint8Array(sig));
 const body=new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion});
 const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body});
 if(!r.ok)throw new Error("Google OAuth HTTP "+r.status);
 const d=await r.json();if(!d.access_token)throw new Error("Google OAuth tidak mengembalikan access token");return d.access_token;
}
function iso(daysAgo){const d=new Date(Date.now()-daysAgo*86400000);return d.toISOString().slice(0,10)}
export function gscState(env){return {configured:!!(env.GSC_CLIENT_EMAIL&&env.GSC_PRIVATE_KEY)}}
export async function searchConsoleSignals(env,siteUrl,type="web",days=28){
 const token=await accessToken(env),end=iso(3),start=iso(days+2);
 const u="https://www.googleapis.com/webmasters/v3/sites/"+encodeURIComponent(siteUrl)+"/searchAnalytics/query";
 const dimensions=type==="web"?["query","page"]:["page"];
 const r=await fetch(u,{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({startDate:start,endDate:end,dimensions,type,rowLimit:250,dataState:"final"})});
 if(!r.ok){let detail="";try{detail=await r.text()}catch{}throw new Error("Search Console HTTP "+r.status+(detail?": "+detail.slice(0,220):""))}
 const d=await r.json(),rows=(d.rows||[]).map(x=>type==="web"?{query:x.keys?.[0]||"",page:x.keys?.[1]||"",clicks:x.clicks||0,impressions:x.impressions||0,ctr:x.ctr||0,position:x.position||0}:{query:"",page:x.keys?.[0]||"",clicks:x.clicks||0,impressions:x.impressions||0,ctr:x.ctr||0,position:x.position||0});
 return {type,startDate:start,endDate:end,rows};
}
const temporal=/\b(hari ini|kemarin|terbaru|breaking|live|update|jadwal|skor|prediksi|hasil pertandingan|gempa|earthquake|m\d(?:\.\d)?|pengumuman|finalis|korupsi|koruptor|kasus|kpk|menteri|menkeu|pilkada|pemilu|202[4-9])\b/i;
const newsPath=/\/202[4-9]\/\d{2}\/\d{2}\//i;
const evergreenPath=/\/(tool|alat-gratis|kamus|glosarium|panduan)\//i;
const evergreen=/\b(cara|apa itu|mengapa|kenapa|perbedaan|arti|mana yang benar|panduan|tips|jenis|fungsi|manfaat|daftar|letak|contoh|pengertian|penulisan)\b/i;
const brand=/\b(zonautara|zona utara|zonatua)\b/i;
const unsafe=/\b(porno|bokep|situs dewasa|judi|slot)\b/i;
const matchEvent=/\b(vs|versus|final|semifinal|pertandingan|skor)\b/i;
const profilePath=/\/orang_sulut\//i;
export function opportunitySignals(report){
 if(report?.type!=="web")return (report?.rows||[]).filter(x=>x.page&&x.impressions>=10).map(x=>({...x,signal:Math.min(100,Math.round(Math.log10(x.impressions+1)*25)),action:"OBSERVE"})).sort((a,b)=>b.impressions-a.impressions).slice(0,50);
 const rows=(report?.rows||[]).filter(x=>x.query&&x.impressions>=10);
 return rows.map(x=>{
  const q=x.query.toLowerCase(),p=String(x.page||"").toLowerCase(),ctrPct=x.ctr*100;
  const queryTemporal=temporal.test(q),datedNews=newsPath.test(p)&&!evergreenPath.test(p);
  const isEvergreenQuery=evergreen.test(q);
  const ineligible=brand.test(q)||unsafe.test(q)||matchEvent.test(q)||profilePath.test(p);
  // Halaman bertanggal tidak otomatis dibuang: artikel bahasa/panduan lama bisa evergreen.
  // Namun halaman bertanggal + query kejadian/aktor aktual harus dianggap temporal.
  const isTemporal=queryTemporal||(datedNews&&!isEvergreenQuery&&/\b(gempa|earthquake|korup|kasus|menteri|menkeu|pemilu|pilkada|breaking)\b/i.test(q));
  let signal=0;
  if(x.impressions>=1000)signal+=35;else if(x.impressions>=300)signal+=28;else if(x.impressions>=100)signal+=22;else if(x.impressions>=30)signal+=14;else signal+=8;
  if(x.position>=4&&x.position<=15)signal+=20;else if(x.position>15&&x.position<=30)signal+=12;else if(x.position<4)signal+=8;
  if(ctrPct<1)signal+=18;else if(ctrPct<3)signal+=14;else if(ctrPct<5)signal+=8;
  if(isEvergreenQuery)signal+=15;
  if(isTemporal)signal-=60;
  if(ineligible)signal-=80;
  signal=Math.max(0,Math.min(100,signal));
  let action="UPDATE";
  if(isTemporal||ineligible)action="IGNORE";
  else if(x.position>20&&x.impressions>=100)action="EXPAND";
  else if(x.position<=3&&ctrPct>=5)action="PROTECT";
  return {...x,signal,evergreen:!isTemporal&&!ineligible,eligible:!isTemporal&&!ineligible,action};
 }).sort((a,b)=>b.signal-a.signal||b.impressions-a.impressions).slice(0,50);
}
