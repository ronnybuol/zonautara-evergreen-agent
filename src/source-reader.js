import { extractText,getDocumentProxy } from "unpdf";
const primary=/\.(go\.id|ac\.id)$/i;
const trusted=/\b(brin\.go\.id|bps\.go\.id|pertanian\.go\.id|kemendesa\.go\.id|ipb\.ac\.id|fao\.org|who\.int|worldbank\.org|un\.org)\b/i;
const risky=/\b(pestisida|insektisida|fungisida|herbisida|nematisida|rodentisida|bahan aktif|dosis|semprot|aplikasi kimia)\b/i;

function domainOf(url){try{return new URL(url).hostname.replace(/^www\./,"")}catch{return""}}
function sourceClass(domain){
 if(/\.go\.id$/i.test(domain)||/\b(fao\.org|who\.int|worldbank\.org|un\.org)\b/i.test(domain))return "official";
 if(/\.ac\.id$/i.test(domain))return "academic";
 if(/\.(org|or\.id)$/i.test(domain))return "organization";
 return "secondary";
}
function tier(domain){const c=sourceClass(domain);return c==="official"||c==="academic"?1:c==="organization"?2:3}
function decode(s){return s.replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">")}
function htmlText(html){
 return decode(String(html||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<noscript[\s\S]*?<\/noscript>/gi," ").replace(/<svg[\s\S]*?<\/svg>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()).slice(0,14000);
}
async function readOne(source){
 const domain=domainOf(source.url),base={...source,domain,tier:tier(domain),source_class:sourceClass(domain),evidence_mode:"none",text:""};
 try{
  const r=await fetch(source.url,{headers:{"User-Agent":"Mozilla/5.0 ZonautaraEvergreenAgent/0.1"},redirect:"follow",signal:AbortSignal.timeout(8000)});
  if(!r.ok)return {...base,read_error:"HTTP "+r.status};
  const type=(r.headers.get("content-type")||"").toLowerCase();
  if(type.includes("application/pdf")||/\.pdf(?:$|\?)/i.test(source.url)){
   const buffer=await r.arrayBuffer();
   if(buffer.byteLength>8000000)return {...base,read_error:"PDF too large"};
   const doc=await getDocumentProxy(new Uint8Array(buffer));
   const extracted=await extractText(doc,{mergePages:true});
   const text=String(extracted.text||"").replace(/\s+/g," ").trim().slice(0,14000);
   if(text.length<300)return {...base,read_error:"PDF text too short"};
   return {...base,evidence_mode:"fulltext",content_type:"pdf",text};
  }
  if(!type.includes("text/html")&&!type.includes("text/plain"))return {...base,read_error:"unsupported "+type.split(";")[0]};
  const text=htmlText(await r.text());
  if(text.length<300)return {...base,read_error:"content too short"};
  return {...base,evidence_mode:"fulltext",text};
 }catch(e){return {...base,read_error:String(e.message||e)}}
}
export async function readSources(results){
 const selected=(results||[]).map((x,i)=>({id:i+1,title:x.title,url:x.url,snippet:x.snippet})).sort((a,b)=>tier(domainOf(a.url))-tier(domainOf(b.url))).slice(0,6);
 const read=await Promise.all(selected.map(readOne));
 return read.sort((a,b)=>a.id-b.id);
}
export function sourcePacket(sources){
 return sources.filter(x=>x.evidence_mode==="fulltext").map(x=>({id:x.id,title:x.title,url:x.url,domain:x.domain,tier:x.tier,source_class:x.source_class,text:x.text}));
}
export function enforceEvidencePolicy(claims,sources){
 const byId=new Map(sources.map(x=>[x.id,x]));
 return claims.map(x=>{
  const refs=(x.source_ids||[]).map(id=>byId.get(id)).filter(Boolean),independent=new Set(refs.map(r=>r.domain)).size,hasPrimary=refs.some(r=>r.tier===1),hasOfficial=refs.some(r=>r.source_class==="official");
  let status=x.status,confidence=x.confidence,note=x.note||"";
  if(!refs.length||refs.some(r=>r.evidence_mode!=="fulltext"))status="reject";
  if(confidence==="high"&&independent<2&&!hasPrimary)confidence="medium";
  if(risky.test(x.claim)&&!hasOfficial){status="verify";note=(note?note+" · ":"")+"Klaim pestisida/input kimia memerlukan sumber resmi/regulator";}
  return {...x,status,confidence,note};
 });
}
