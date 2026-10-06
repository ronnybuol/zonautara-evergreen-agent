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
 const r=await fetch(u,{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({startDate:start,endDate:end,dimensions:["query","page"],type,rowLimit:250,dataState:"final"})});
 if(!r.ok){let detail="";try{detail=await r.text()}catch{}throw new Error("Search Console HTTP "+r.status+(detail?": "+detail.slice(0,220):""))}
 const d=await r.json(),rows=(d.rows||[]).map(x=>({query:x.keys?.[0]||"",page:x.keys?.[1]||"",clicks:x.clicks||0,impressions:x.impressions||0,ctr:x.ctr||0,position:x.position||0}));
 return {type,startDate:start,endDate:end,rows};
}
export function opportunitySignals(report){
 const rows=(report?.rows||[]).filter(x=>x.query&&x.impressions>=10);
 return rows.map(x=>{
  const ctrPct=x.ctr*100;
  let signal=0;
  if(x.impressions>=100)signal+=25;else if(x.impressions>=30)signal+=15;else signal+=8;
  if(x.position>=4&&x.position<=20)signal+=20;else if(x.position>20&&x.position<=50)signal+=10;
  if(ctrPct<2)signal+=15;else if(ctrPct<5)signal+=8;
  return {...x,signal};
 }).sort((a,b)=>b.signal-a.signal||b.impressions-a.impressions).slice(0,50);
}
