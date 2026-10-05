function parseJson(text){
 const raw=String(text||"").trim().replace(/^\`\`\`(?:json)?\s*/i,"").replace(/\s*\`\`\`$/,"");
 const tries=[raw];
 const a=raw.indexOf("{"),b=raw.lastIndexOf("}");
 if(a>=0&&b>a)tries.push(raw.slice(a,b+1));
 for(const x of tries){try{return JSON.parse(x)}catch{}}
 throw new Error("LLM JSON tidak valid");
}
async function callOpenRouter(messages,settings,env,temperature){
 const token=String(env.OPENROUTER_API_KEY||"").trim();
 if(!token)throw new Error("OPENROUTER_API_KEY belum dipasang");
 const model=(settings.llm_model||"").trim()||"openrouter/free";
 const r=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({model,messages,temperature,response_format:{type:"json_object"}})});
 if(!r.ok){let detail="";try{detail=await r.text()}catch{}throw new Error("OpenRouter HTTP "+r.status+(detail?": "+detail.slice(0,180):""))}
 const d=await r.json();
 return {content:String(d.choices?.[0]?.message?.content||""),model:d.model||model,usage:d.usage||null};
}
export async function askJson(instruction,settings,env,temperature=0.1,stage="LLM"){
 const first=await callOpenRouter([{role:"user",content:instruction}],settings,env,temperature);
 try{return {data:parseJson(first.content),model:first.model,usage:first.usage,repaired:false}}
 catch{
  const repair="Respons sebelumnya gagal diparse sebagai JSON. Kembalikan HANYA JSON valid yang memenuhi instruksi awal. Jangan pakai markdown atau komentar. INSTRUKSI AWAL: "+instruction+" RESPONS RUSAK: "+first.content.slice(0,12000);
  const second=await callOpenRouter([{role:"user",content:repair}],settings,env,0);
  try{return {data:parseJson(second.content),model:second.model,usage:second.usage,repaired:true}}
  catch{throw new Error(stage+" gagal menghasilkan JSON valid · model "+second.model)}
 }
}
export async function curateTopics(category,seed,settings,env){
 const landscape=(seed.results||[]).map((x,i)=>({id:i+1,title:x.title,snippet:x.snippet,url:x.url}));
 const instruction="Buat tepat 5 kandidat topik evergreen Bahasa Indonesia yang natural dan spesifik dari landscape ini. Jangan menambah fakta dari pengetahuan sendiri. Bukan berita/current event, politik, kriminal, rumor, harga hari ini, atau YMYL berisiko. Setiap kandidat 3-8 kata dan harus didukung source_ids dari landscape. Output HANYA JSON dengan bentuk: {\"candidates\":[{\"query\":\"...\",\"intent\":\"how-to|informational\",\"source_ids\":[1,2],\"rationale\":\"...\"}]}. Kategori: "+category+" LANDSCAPE: "+JSON.stringify(landscape);
 const out=await askJson(instruction,settings,env,0.2,"Topic Curator"),obj=out.data,arr=Array.isArray(obj.candidates)?obj.candidates:[];
 const candidates=arr.map(x=>({query:String(x.query||"").trim(),intent:String(x.intent||"informational"),source_ids:Array.isArray(x.source_ids)?x.source_ids:[],rationale:String(x.rationale||"").trim()})).filter(x=>x.query.split(/\s+/).length>=3).slice(0,5);
 if(candidates.length<3)throw new Error("Topic Curator menghasilkan kandidat terlalu sedikit");
 return {provider:"openrouter",model:out.model,candidates,usage:out.usage,repaired:out.repaired};
}
export function llmState(env){return {openrouter:!!env.OPENROUTER_API_KEY};}
