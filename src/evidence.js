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
 const sources=(research.results||[]).map((x,i)=>({id:Number(x.id)||i+1,title:x.title,url:x.url,snippet:x.snippet}));
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
 const usable=claims.filter(x=>x.status==="usable"),core=usable.filter(x=>x.relevance==="core"),gaps=Array.isArray(data.gaps)?data.gaps.map(x=>typeof x==="string"?x:(x?.gap||x?.issue||x?.description||x?.reason||JSON.stringify(x))):[];
 const editorial_notes=Array.isArray(data.editorial_notes)?data.editorial_notes.map(x=>typeof x==="string"?x:(x?.note||x?.issue||x?.description||JSON.stringify(x))):[];\n const source_unavailable=Array.isArray(data.source_unavailable)?data.source_unavailable.map(x=>typeof x==="string"?x:(x?.source||x?.reason||x?.description||JSON.stringify(x))):[];
 const intent=intentOf(topic),coverage=intent==="how-to"?(core.length>=3?"adequate":"insufficient"):(core.length>=2?"adequate":"insufficient");
 const minimumCore=intent==="how-to"?3:2,minimumUsable=5;
 const ready=usable.length>=minimumUsable&&core.length>=minimumCore&&coverage==="adequate";
 let gateReason="Bukti inti cukup";
 if(!ready){
  if(core.length<minimumCore)gateReason="Klaim inti belum cukup: "+core.length+"/"+minimumCore;
  else if(usable.length<minimumUsable)gateReason="Jumlah klaim usable belum cukup: "+usable.length+"/"+minimumUsable;
  else gateReason="Cakupan evidence belum memadai";
 }
 return {topic,intent,model,sources,claims,usable_count:usable.length,core_usable_count:core.length,total_claims:claims.length,gaps,editorial_notes,source_unavailable,coverage,ready,gate_reason:gateReason};
}


export function refreshEvidencePrompt(brief,research,currentText=""){
 const sources=(research.results||[]).map((x,i)=>({id:Number(x.id)||i+1,title:x.title,url:x.url,snippet:x.snippet}));
 const goals=brief?.research_goals||[],queries=brief?.research_queries||[];
 const instruction="Susun Evidence Ledger untuk REFRESH artikel lama Zonautara. Gunakan HANYA SOURCES sebagai bukti. CURRENT_ARTICLE hanya konteks audit dan BUKAN sumber kebenaran. Verifikasi jawaban utama, tandai klaim lama yang tidak didukung bila terlihat, dan kumpulkan evidence yang benar-benar membantu tujuan refresh. Jangan menciptakan fakta baru. Prioritaskan sumber primer/otoritatif sesuai PREFERRED_SOURCES. Output JSON dengan claims, gaps, editorial_notes, dan source_unavailable. gaps HANYA untuk kekurangan bukti faktual/sumber. Masalah SEO, meta description, internal link, struktur, tanggal pembaruan, atau presentasi halaman wajib masuk editorial_notes, BUKAN gaps. Jangan menafsirkan salah eja sebagai nama organisasi, merek, atau entitas tanpa dukungan SOURCES. Jika sumber primer yang diminta tidak tersedia, dibatasi, login-only, atau tidak dapat dibaca, masukkan ke source_unavailable dan jangan mengarang isi sumber tersebut. Setiap claim wajib memiliki source_ids, confidence high|medium|low, status usable|verify|reject, relevance core|supporting|offtopic, time_sensitive true|false. PRIMARY_QUERY: "+(brief?.search_console?.primary_query||"")+" RESEARCH_QUERIES: "+JSON.stringify(queries)+" GOALS: "+JSON.stringify(goals)+" PREFERRED_SOURCES: "+JSON.stringify(brief?.preferred_sources||[])+" CURRENT_TITLE: "+(brief?.current_title||"")+" CURRENT_ARTICLE: "+String(currentText||"").slice(0,10000)+" SOURCES: "+JSON.stringify(sources);
 return {instruction,sources};
}
