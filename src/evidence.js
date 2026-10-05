function normalizeClaim(x,validIds){
 const ids=(Array.isArray(x.source_ids)?x.source_ids:[]).map(Number).filter(id=>validIds.has(id));
 let status=String(x.status||"verify").toLowerCase();
 let confidence=String(x.confidence||"low").toLowerCase();
 if(!ids.length)status="reject";
 if(!["usable","verify","reject"].includes(status))status="verify";
 if(!["high","medium","low"].includes(confidence))confidence="low";
 return {claim:String(x.claim||"").trim(),source_ids:ids,confidence,status,note:String(x.note||"").trim()};
}
export function evidencePrompt(topic,research){
 const sources=(research.results||[]).map((x,i)=>({id:i+1,title:x.title,url:x.url,snippet:x.snippet}));
 const instruction="Susun Evidence Ledger jurnalistik hanya dari sumber berikut. Jangan gunakan pengetahuan di luar input. Buat klaim atomik. Setiap source_ids harus benar-benar mendukung klaim. Confidence high hanya jika didukung minimal dua sumber independen atau satu sumber primer yang jelas; medium jika satu sumber memadai; low jika ambigu. Status usable hanya jika klaim eksplisit didukung; selain itu verify atau reject. Jangan mengarang angka, tanggal, nama, sebab-akibat, atau kesimpulan. Output hanya JSON dengan claims dan gaps. TOPIK: "+topic+" SOURCES: "+JSON.stringify(sources);
 return {instruction,sources};
}
export function finalizeLedger(topic,sources,data,model){
 const validIds=new Set(sources.map(x=>x.id));
 const claims=(Array.isArray(data.claims)?data.claims:[]).map(x=>normalizeClaim(x,validIds)).filter(x=>x.claim);
 const usable=claims.filter(x=>x.status==="usable");
 return {topic,model,sources,claims,usable_count:usable.length,total_claims:claims.length,gaps:Array.isArray(data.gaps)?data.gaps.map(String):[],ready:usable.length>=5};
}
