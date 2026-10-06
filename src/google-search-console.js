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
 const r=await fetch(u,{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({startDate:start,endDate:end,dimensions,type,rowLimit:type==="web"?2500:250,dataState:"final"})});
 if(!r.ok){let detail="";try{detail=await r.text()}catch{}throw new Error("Search Console HTTP "+r.status+(detail?": "+detail.slice(0,220):""))}
 const d=await r.json(),rows=(d.rows||[]).map(x=>type==="web"?{query:x.keys?.[0]||"",page:x.keys?.[1]||"",clicks:x.clicks||0,impressions:x.impressions||0,ctr:x.ctr||0,position:x.position||0}:{query:"",page:x.keys?.[0]||"",clicks:x.clicks||0,impressions:x.impressions||0,ctr:x.ctr||0,position:x.position||0});
 return {type,startDate:start,endDate:end,rows};
}
const temporal=/\b(hari ini|kemarin|terbaru|breaking|live|update|jadwal|skor|prediksi|hasil pertandingan|gempa|earthquake|m\d(?:\.\d)?|pengumuman|finalis|korupsi|koruptor|kasus|kpk|menteri|menkeu|pilkada|pemilu|202[4-9])\b/i;
const newsPath=/\/202[4-9]\/\d{2}\/\d{2}\//i;
const evergreenPath=/\/(tool|alat-gratis|kamus|glosarium|panduan)\//i;
const evergreen=/\b(cara|apa itu|mengapa|kenapa|perbedaan|arti|mana yang benar|panduan|tips|jenis|fungsi|manfaat|daftar|letak|contoh|pengertian|penulisan)\b/i;
const brand=/\b(zonautara|zona utara|zonatua|zona tua)\b/i;
const unsafe=/\b(porno|bokep|xxx|situs dewasa|judi|slot)\b/i;
const matchEvent=/\b(vs|versus|final|semifinal|pertandingan|skor|tempat dan cara menonton|cara menontonnya)\b/i;
const profilePath=/\/orang_sulut\//i;
function scoredWebRows(report){
 if(report?.type!=="web")return [];
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
 }).sort((a,b)=>b.signal-a.signal||b.impressions-a.impressions);
}
export function opportunitySignals(report){
 if(report?.type!=="web")return (report?.rows||[]).filter(x=>x.page&&x.impressions>=10).map(x=>({...x,signal:Math.min(100,Math.round(Math.log10(x.impressions+1)*25)),action:"OBSERVE"})).sort((a,b)=>b.impressions-a.impressions).slice(0,50);
 return scoredWebRows(report).slice(0,50);
}

export function clusterOpportunities(report){
 if(report?.type!=="web")return [];
 const items=scoredWebRows(report).filter(x=>x.eligible&&x.action!=="IGNORE");
 const groups=new Map();
 for(const x of items){
  const key=x.page||x.query;
  if(!groups.has(key))groups.set(key,{page:x.page,queries:[],clicks:0,impressions:0,weightedPosition:0,maxSignal:0});
  const g=groups.get(key);
  g.queries.push(x);
  g.clicks+=x.clicks||0;
  g.impressions+=x.impressions||0;
  g.weightedPosition+=(x.position||0)*(x.impressions||0);
  g.maxSignal=Math.max(g.maxSignal,x.signal||0);
 }
 return [...groups.values()].map(g=>{
  const ctr=g.impressions?g.clicks/g.impressions:0;
  const position=g.impressions?g.weightedPosition/g.impressions:0;
  const sorted=[...g.queries].sort((a,b)=>b.impressions-a.impressions);
  const primary=sorted[0]||{};
  const queryCount=sorted.length;
  let score=g.maxSignal;
  if(queryCount>=4)score+=8;else if(queryCount>=2)score+=4;
  if(g.impressions>=3000)score+=8;else if(g.impressions>=1000)score+=5;
  score=Math.min(100,Math.round(score));
  let action="UPDATE";
  if(position<=3&&ctr>=0.05)action="PROTECT";
  else if(position>15&&g.impressions>=300)action="EXPAND";
  else if(queryCount>=3&&position<=10)action="UPDATE";
  return {
   page:g.page,
   primary_query:primary.query||"",
   query_variants:sorted.slice(0,12).map(x=>x.query),
   query_count:queryCount,
   clicks:g.clicks,
   impressions:g.impressions,
   ctr,
   position:Number(position.toFixed(2)),
   signal:score,
   action
  };
 }).sort((a,b)=>b.signal-a.signal||b.impressions-a.impressions).slice(0,30);
}


function editorialReason(x){
 const ctrPct=x.ctr*100;
 if(x.action==="PROTECT")return "Posisi dan CTR sudah kuat; pertahankan intent, URL, dan struktur utama.";
 if(x.action==="EXPAND")return "Demand terlihat tetapi posisi masih lemah; teliti sub-intent untuk artikel pendukung, bukan mengganti halaman utama.";
 if(x.impressions>=1000&&x.position<=5&&ctrPct<2)return "Impressions tinggi dan ranking kuat, tetapi CTR rendah; prioritaskan refresh judul, dek, snippet, dan kecocokan intent.";
 if(x.query_count>=3)return "Banyak variasi query menuju halaman yang sama; refresh halaman agar menjawab cluster intent secara lebih lengkap.";
 return "Ada demand evergreen yang layak ditingkatkan pada halaman yang sudah ada.";
}
export function editorialOpportunityQueue(report){
 return clusterOpportunities(report).map(x=>{
  const ctrPct=x.ctr*100;
  let action=x.action==="UPDATE"?"REFRESH":x.action;
  let priority=x.signal;
  if(action==="REFRESH"&&x.impressions>=1000&&ctrPct<2)priority+=8;
  if(action==="PROTECT")priority-=15;
  if(action==="EXPAND"&&x.impressions>=500)priority+=5;
  priority=Math.max(0,Math.min(100,Math.round(priority)));
  return {
   ...x,
   editorial_action:action,
   priority,
   reason:editorialReason({...x,action}),
   next_step:action==="REFRESH"?"AUDIT_EXISTING_PAGE":action==="EXPAND"?"RESEARCH_SUBINTENTS":action==="PROTECT"?"MONITOR_ONLY":"HOLD",
   auto_write:false
  };
 }).sort((a,b)=>b.priority-a.priority||b.impressions-a.impressions).slice(0,20);
}


function textOnly(html){return String(html||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim()}
function tokens(s){return [...new Set(String(s||"").toLowerCase().normalize("NFKC").replace(/[^a-z0-9\u00c0-\u024f\s-]/g," ").split(/\s+/).filter(x=>x.length>2&&!["yang","dan","atau","dari","untuk","dengan","pada","adalah","ini","itu"].includes(x)))]}
function queryCoverage(query,text){
 const ts=tokens(query);if(!ts.length)return 0;
 const hay=" "+String(text||"").toLowerCase()+" ";
 return ts.filter(t=>hay.includes(t)).length/ts.length;
}
export async function auditExistingPage(item){
 const page=String(item?.page||"");
 if(!/^https:\/\/zonautara\.com\//i.test(page))throw new Error("Audit hanya diizinkan untuk halaman zonautara.com");
 const r=await fetch(page,{headers:{"user-agent":"ZonautaraEvergreenAgent/1.0"}});
 if(!r.ok)throw new Error("Existing page HTTP "+r.status);
 const html=await r.text();
 const title=(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||"").replace(/\s*[-|]\s*Zonautara.*$/i,"").trim();
 const body=textOnly(html).slice(0,50000);
 const variants=(item.query_variants||[]).slice(0,12);
 const coverage=variants.map(query=>({query,coverage:Number(queryCoverage(query,title+" "+body).toFixed(2))}));
 const gaps=coverage.filter(x=>x.coverage<0.6).map(x=>x.query);
 const covered=coverage.filter(x=>x.coverage>=0.6).map(x=>x.query);
 let recommendation=item.editorial_action||item.action||"REFRESH";
 if(recommendation==="REFRESH"&&!gaps.length&&item.ctr>=0.03)recommendation="PROTECT";
 return {page,title,word_count:body.split(/\s+/).filter(Boolean).length,covered_queries:covered,gap_queries:gaps,coverage,recommendation,audited_at:new Date().toISOString()};
}
