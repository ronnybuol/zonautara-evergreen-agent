import { dashboard } from "./ui.js";
import { researchTopic,providerState } from "./research.js";
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json;charset=UTF-8"}});
async function settings(env){const r=await env.DB.prepare("SELECT key,value FROM settings").all();return Object.fromEntries(r.results.map(x=>[x.key,x.value]));}
function localHM(tz){const p=new Intl.DateTimeFormat("en-GB",{timeZone:tz,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());return p.find(x=>x.type==="hour").value+":"+p.find(x=>x.type==="minute").value;}
function inWindow(now,start,end){return start<=end?now>=start&&now<=end:now>=start||now<=end;}
async function runCycle(env,source="cron"){
 const s=await settings(env);if(s.enabled!=="true")return{ok:true,skipped:true,reason:"agent_paused"};
 const now=localHM(s.timezone||"Asia/Makassar");if(!inWindow(now,s.active_start,s.active_end))return{ok:true,skipped:true,reason:"outside_active_window",now};
 const today=await env.DB.prepare("SELECT COUNT(*) n FROM jobs WHERE date(created_at)=date('now')").first();if(Number(today.n)>=Number(s.daily_limit||12))return{ok:true,skipped:true,reason:"daily_limit"};
 const list=(s.topics||"Pengetahuan umum").split(",").map(x=>x.trim()).filter(Boolean),topic=list[Math.floor(Math.random()*list.length)];
 const q=await env.DB.prepare("INSERT INTO jobs(status,topic,reason) VALUES('researching',?,'source-first research')").bind(topic).run(),id=q.meta.last_row_id;
 try{const r=await researchTopic(topic,s.research_provider||"brave",env);await env.DB.prepare("UPDATE jobs SET status=?,reason=?,article_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(r.enough?"researched":"rejected",r.enough?`research OK: ${r.results.length} sumber / ${r.domain_count} domain`:"evidence tidak cukup",JSON.stringify({research:r}),id).run();return{ok:true,job_id:id,topic,research:r};}
 catch(e){await env.DB.prepare("UPDATE jobs SET status='error',reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(e.message,id).run();return{ok:false,job_id:id,error:e.message};}
}
export default{async fetch(req,env){const u=new URL(req.url);
 if(u.pathname==="/api/status"){const s=await settings(env);const jobs=await env.DB.prepare("SELECT * FROM jobs ORDER BY id DESC LIMIT 20").all();return json({settings:s,jobs:jobs.results,providers:providerState(env)});}
 if(u.pathname==="/api/settings"&&req.method==="POST"){const body=await req.json(),allowed=["enabled","mode","active_start","active_end","daily_limit","min_publish_score","min_review_score","topics","research_provider","llm_provider","llm_model"];for(const k of allowed)if(body[k]!==undefined)await env.DB.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(k,String(body[k])).run();return json({ok:true,settings:await settings(env)});}
 if(u.pathname==="/api/research-test"&&req.method==="POST"){const b=await req.json(),s=await settings(env);try{return json({ok:true,...await researchTopic(b.topic||"pengetahuan umum",b.provider||s.research_provider||"brave",env)});}catch(e){return json({ok:false,error:e.message},400);}}
 if(u.pathname==="/api/run"&&req.method==="POST")return json(await runCycle(env,"manual"));
 if(u.pathname==="/"||u.pathname==="/dashboard")return new Response(dashboard,{headers:{"content-type":"text/html;charset=UTF-8"}});
 return json({error:"not_found"},404);},async scheduled(event,env,ctx){ctx.waitUntil(runCycle(env,"cron"))}};
