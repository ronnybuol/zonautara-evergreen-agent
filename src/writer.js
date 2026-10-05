function uniqueDomains(ids,sources){
 const map=new Map(sources.map(x=>[x.id,x]));
 return new Set(ids.map(id=>map.get(id)?.domain).filter(Boolean)).size;
}
export function balanceEvidence(ledger){
 const sources=ledger.sources||[],usable=(ledger.claims||[]).filter(x=>x.status==="usable"&&x.relevance!=="offtopic");
 const ranked=usable.map(x=>{
  const refs=(x.source_ids||[]).map(id=>sources.find(s=>s.id===id)).filter(Boolean);
  const primary=refs.some(s=>s.tier===1),official=refs.some(s=>s.source_class==="official"),multi=uniqueDomains(x.source_ids||[],sources)>=2;
  return {...x,_weight:(x.relevance==="core"?4:1)+(multi?4:0)+(primary?2:0)+(official?2:0)+(x.confidence==="high"?1:0),_primary:primary,_official:official,_multi:multi};
 }).sort((a,b)=>b._weight-a._weight);
 const picked=[],perSource=new Map();
 for(const claim of ranked){
  const ids=claim.source_ids||[];
  const dominated=ids.length===1&&(perSource.get(ids[0])||0)>=8;
  if(dominated)continue;
  picked.push(claim);
  for(const id of ids)perSource.set(id,(perSource.get(id)||0)+1);
  if(picked.length>=24)break;
 }
 const core=picked.filter(x=>x.relevance==="core");
 return {claims:picked.map(({_weight,_primary,_official,_multi,...x})=>x),core_count:core.length,total:picked.length,source_usage:Object.fromEntries(perSource),ready:ledger.ready&&core.length>=4};
}
export function writerPrompt(topic,ledger,balanced){
 const sourceIndex=(ledger.sources||[]).filter(s=>balanced.claims.some(c=>(c.source_ids||[]).includes(s.id))).map(s=>({id:s.id,title:s.title,url:s.url,domain:s.domain,tier:s.tier,source_class:s.source_class}));
 const claims=balanced.claims.map((x,i)=>({claim_id:i+1,claim:x.claim,source_ids:x.source_ids,relevance:x.relevance,confidence:x.confidence}));
 return "Tulis artikel evergreen Bahasa Indonesia untuk media jurnalistik. Artikel harus terasa sebagai penjelasan utuh, bukan daftar klaim atau parafrase sumber. Buat pembuka yang langsung menjawab topik menggunakan claim_ids yang relevan, kelompokkan klaim secara logis dalam 2-5 bagian, dan gunakan transisi natural. Jangan memaksakan panjang; lebih baik ringkas daripada mengisi kekosongan.  Gunakan HANYA CLAIMS. Dilarang menambah fakta, angka, nama, sebab-akibat, tips, atau kesimpulan dari pengetahuan sendiri. Jangan isi GAPS. Jika bukti tidak cukup, tulis lebih sempit. Hindari gaya promosi, clickbait, dan frasa generik AI. Parafrase secara orisinal; jangan menyalin kalimat sumber. Setiap paragraf faktual harus memiliki claim_ids. Output HANYA JSON: {title,slug,meta_description,dek,search_intent,sections:[{heading,paragraphs:[{text,claim_ids:[]}]}],source_ids:[]}. Judul natural dan akurat; meta_description maksimal 155 karakter; slug ringkas. TOPIK: "+topic+" GAPS: "+JSON.stringify(ledger.gaps||[])+" CLAIMS: "+JSON.stringify(claims)+" SOURCES: "+JSON.stringify(sourceIndex);
}
export function finalizeArticle(data,ledger,balanced,model){
 const valid=new Set(balanced.claims.map((_,i)=>i+1));
 const sections=(Array.isArray(data.sections)?data.sections:[]).map(s=>({heading:String(s.heading||"").trim(),paragraphs:(Array.isArray(s.paragraphs)?s.paragraphs:[]).map(p=>({text:String(p.text||"").trim(),claim_ids:(Array.isArray(p.claim_ids)?p.claim_ids:[]).map(Number).filter(id=>valid.has(id))})).filter(p=>p.text)})).filter(s=>s.heading&&s.paragraphs.length);
 const unsupported=sections.flatMap(s=>s.paragraphs).filter(p=>!p.claim_ids.length).length;
 const html=sections.map(s=>"<h2>"+escapeHtml(s.heading)+"</h2>"+s.paragraphs.map(p=>"<p>"+escapeHtml(p.text)+"</p>").join("")).join("");
 const usedClaimIds=[...new Set(sections.flatMap(s=>s.paragraphs.flatMap(p=>p.claim_ids)))];
 const sourceIds=[...new Set(usedClaimIds.flatMap(id=>balanced.claims[id-1]?.source_ids||[]))];
 const sources=(ledger.sources||[]).filter(s=>sourceIds.includes(s.id)).map(s=>({id:s.id,title:s.title,url:s.url,domain:s.domain,tier:s.tier,source_class:s.source_class}));
 return {model,title:String(data.title||"").trim(),slug:String(data.slug||"").trim(),meta_description:String(data.meta_description||"").trim().slice(0,155),dek:String(data.dek||"").trim(),search_intent:String(data.search_intent||ledger.intent||"informational"),sections,html,used_claim_ids:usedClaimIds,unsupported_paragraphs:unsupported,sources,ready:!!data.title&&sections.length>=2&&unsupported===0};
}
function escapeHtml(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
