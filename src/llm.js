function parseJson(text){
 const raw=String(text||"").trim().replace(/^\`\`\`(?:json)?\s*/i,"").replace(/\s*\`\`\`$/,"");
 try{return JSON.parse(raw)}catch{const a=raw.indexOf("{"),b=raw.lastIndexOf("}");if(a>=0&&b>a)return JSON.parse(raw.slice(a,b+1));throw new Error("LLM JSON tidak valid")}
}
export async function curateTopics(category,seed,settings,env){
 const token=String(env.OPENROUTER_API_KEY||"").trim();
 if(!token)throw new Error("OPENROUTER_API_KEY belum dipasang");
 const model=(settings.llm_model||"").trim()||"openrouter/free";
 const landscape=(seed.results||[]).map((x,i)=>({id:i+1,title:x.title,snippet:x.snippet,url:x.url}));
 const instruction="Buat tepat 5 kandidat topik evergreen Bahasa Indonesia yang natural dan spesifik dari landscape ini. Jangan menambah fakta dari pengetahuan sendiri. Bukan berita/current event, politik, kriminal, rumor, harga hari ini, atau YMYL berisiko. Setiap kandidat 3-8 kata dan harus didukung source_ids dari landscape. Output HANYA JSON dengan bentuk: {\"candidates\":[{\"query\":\"...\",\"intent\":\"how-to|informational\",\"source_ids\":[1,2],\"rationale\":\"...\"}]}. Kategori: "+category+" LANDSCAPE: "+JSON.stringify(landscape);
 const r=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({model,messages:[{role:"user",content:instruction}],temperature:0.2,response_format:{type:"json_object"}})});
 if(!r.ok)throw new Error("OpenRouter HTTP "+r.status);
 const d=await r.json(),obj=parseJson(d.choices?.[0]?.message?.content),arr=Array.isArray(obj.candidates)?obj.candidates:[];
 const candidates=arr.map(x=>({query:String(x.query||"").trim(),intent:String(x.intent||"informational"),source_ids:Array.isArray(x.source_ids)?x.source_ids:[],rationale:String(x.rationale||"").trim()})).filter(x=>x.query.split(/\s+/).length>=3).slice(0,5);
 if(candidates.length<3)throw new Error("Topic Curator menghasilkan kandidat terlalu sedikit");
 return {provider:"openrouter",model:d.model||model,candidates,usage:d.usage||null};
}
export function llmState(env){return {openrouter:!!env.OPENROUTER_API_KEY};}
