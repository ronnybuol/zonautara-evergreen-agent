import { enforceEvidencePolicy } from "./source-reader.js";
function normalizeClaim(x,validIds){
 const ids=(Array.isArray(x.source_ids)?x.source_ids:[]).map(Number).filter(id=>validIds.has(id));
 let status=String(x.status||"verify").toLowerCase(),confidence=String(x.confidence||"low").toLowerCase();
 if(!ids.length)status="reject";
 if(!["usable","verify","reject"].includes(status))status="verify";
 if(!["high","medium","low"].includes(confidence))confidence="low";
 return {claim:String(x.claim||"").trim(),source_ids:ids,confidence,status,note:String(x.note||"").trim(),relevance:String(x.relevance||"supporting").toLowerCase(),time_sensitive:!!x.time_sensitive};
}
function intentOf(topic){return /\b(cara|langkah|panduan|mengakses|mendaftar|mengajukan|membuat|mengatasi)\b/i.test(topic)?"how-to":"informational"}
export function evidencePrompt(topic,research){
 const sources=(research.results||[]).map((x,i)=>({id:i+1,title:x.title,url:x.url,snippet:x.snippet}));
 const instruction="Susun Evidence Ledger jurnalistik HANYA dari SOURCES. Jangan gunakan pengetahuan luar. Topik harus dijawab persis, jangan mencampur program/skema yang namanya mirip. Untuk tiap klaim beri source_ids, confidence high|medium|low, status usable|verify|reject, relevance core|supporting|offtopic, dan time_sensitive true|false. Klaim kebijakan, persentase, jadwal, syarat, pejabat, atau aturan bertahun tertentu adalah time_sensitive dan jangan dianggap berlaku sekarang tanpa sumber yang jelas mendukung periode berlaku. Untuk topik how-to, klaim core harus benar-benar menjelaskan prosedur, syarat, pihak tujuan, atau langkah akses; informasi latar belakang hanya supporting. Identifikasi gaps terutama bila jawaban inti tidak tersedia. Output JSON dengan claims dan gaps. TOPIK: "+topic+" INTENT: "+intentOf(topic)+" SOURCES: "+JSON.stringify(sources);
 return {instruction,sources};
}
export function finalizeLedger(topic,sources,data,model){
 const validIds=new Set(sources.map(x=>x.id));
 let claims=(Array.isArray(data.claims)?data.claims:[]).map(x=>normalizeClaim(x,validIds)).filter(x=>x.claim);
 claims=enforceEvidencePolicy(claims,sources);
 for(const x of claims){
  if(x.relevance==="offtopic")x.status="reject";
  if(x.time_sensitive&&x.confidence!=="high"&&x.status==="usable")x.status="verify";
 }
 const usable=claims.filter(x=>x.status==="usable"),core=usable.filter(x=>x.relevance==="core"),gaps=Array.isArray(data.gaps)?data.gaps.map(String):[];
 const intent=intentOf(topic),coverage=intent==="how-to"?(core.length>=3?"adequate":"insufficient"):(core.length>=2?"adequate":"insufficient");
 const ready=usable.length>=5&&coverage==="adequate";
 return {topic,intent,model,sources,claims,usable_count:usable.length,core_usable_count:core.length,total_claims:claims.length,gaps,coverage,ready,gate_reason:ready?"Bukti inti cukup":"Bukti inti belum cukup untuk menjawab intent artikel"};
}
