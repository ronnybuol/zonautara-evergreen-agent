import { dashboard } from "./ui.js";
import { researchTopic,researchQuery,providerState } from "./research.js";
import { discoverQueries,evaluateCandidate } from "./opportunity.js";
import { curateTopics,llmState,askJson } from "./llm.js";
import { evidencePrompt,finalizeLedger } from "./evidence.js";
import { readSources,sourcePacket } from "./source-reader.js";
import { balanceEvidence,writerPrompt,finalizeArticle } from "./writer.js";
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json;charset=UTF-8",...headers}});
async function settings(env){const r=await env.DB.prepare("SELECT key,value FROM settings").all();return Object.fromEntries(r.results.map(x=>[x.key,x.value]));}
function localParts(tz){const p=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));return {hm:p.hour+":"+p.minute,date:p.year+"-"+p.month+"-"+p.day};}
function inWindow(now,start,end){return start<=end?now>=start&&now<=end:now>=start||now<=end;}
async function sha256(s){const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,"0")).join("");}
async function sessionToken(password){return sha256("zea-session:"+password);}
async function authorized(req,env){if(!env.ADMIN_PASSWORD)return false;const cookie=req.headers.get("cookie")||"",m=cookie.match(/(?:^|;\s*)zea_session=([^;]+)/);return !!m&&m[1]===await sessionToken(String(env.ADMIN_PASSWORD));}
async function opportunity(category,provider,env,s={}){
 const seed=await researchQuery(category+" panduan masalah teknik jenis Indonesia",provider,env);
 let queries=[],curator=null;
 if((s.llm_provider||"openrouter")==="openrouter"&&env.OPENROUTER_API_KEY){
  curator=await curateTopics(category,seed,s,env);queries=curator.candidates.map(x=>x.query);
 }else queries=discoverQueries(category,seed);
 const tested=[];
 for(const query of queries){const research=await researchQuery(query+" Indonesia",provider,env),evaluation=evaluateCandidate(query,research);tested.push({...evaluation,research});}
 tested.sort((a,b)=>b.score-a.score);
 const best=tested.find(x=>x.decision==="CONTINUE")||tested[0]||null;
 return {category,seed_query:seed.query,curator:curator?{provider:curator.provider,model:curator.model,candidates:curator.candidates}:null,best,candidates:tested.map(x=>({query:x.query,intent:x.intent,score:x.score,editorial_fit:x.editorial_fit,evergreen:x.evergreen,source_count:x.source_count,domain_count:x.domain_count,authority_domains:x.authority_domains,commercial_share:x.commercial_share,decision:x.decision}))};
}
async function evidenceLedger(topic,research,s,env){const read=await readSources(research.results||[]),packet=sourcePacket(read);if(packet.length<2)return finalizeLedger(topic,read,{claims:[],gaps:["Kurang dari dua sumber dapat dibaca penuh"]},"none");const built=evidencePrompt(topic,{results:packet.map(x=>({id:x.id,title:x.title,url:x.url,snippet:x.text}))}),out=await askJson(built.instruction,s,env,0.1,"Evidence Ledger");return finalizeLedger(topic,read,out.data,out.model);}
function mergeResearch(a,b){
 const seen=new Set(),results=[];
 for(const x of [...(a?.results||[]),...(b?.results||[])]){if(!x.url||seen.has(x.url))continue;seen.add(x.url);results.push(x);}
 const domains=[...new Set(results.map(x=>{try{return new URL(x.url).hostname.replace(/^www\./,"")}catch{return""}}).filter(Boolean))];
 return {query:(a?.query||"")+" + enrichment",provider:a?.provider||b?.provider,results:results.slice(0,12),domain_count:domains.length,enough:results.length>=4&&domains.length>=3};
}
async function writerPreview(topic,ledger,s,env){
 const balanced=balanceEvidence(ledger);
 if(!balanced.ready)throw new Error("Evidence belum cukup untuk Writer · "+balanced.core_count+" klaim core / "+balanced.total+" usable");
 const prompt=writerPrompt(topic,ledger,balanced),out=await askJson(prompt,s,env,0.25,"Article Writer");
 return {balanced,article:finalizeArticle(out.data,ledger,balanced,out.model)};
}
async function runCycle(env,source="cron"){
 const s=await settings(env);if(s.enabled!=="true")return{ok:true,skipped:true,reason:"agent_paused"};
 const lp=localParts(s.timezone||"Asia/Makassar");if(!inWindow(lp.hm,s.active_start,s.active_end))return{ok:true,skipped:true,reason:"outside_active_window",now:lp.hm};
 const start=lp.date+"T00:00:00+08:00",end=lp.date+"T23:59:59+08:00";
 const today=await env.DB.prepare("SELECT COUNT(*) n FROM jobs WHERE datetime(created_at)>=datetime(?) AND datetime(created_at)<=datetime(?)").bind(start,end).first();
 if(Number(today.n)>=Number(s.daily_limit||12))return{ok:true,skipped:true,reason:"daily_limit"};
 const list=(s.topics||"Pengetahuan umum").split(",").map(x=>x.trim()).filter(Boolean),category=list[Math.floor(Math.random()*list.length)];
 const q=await env.DB.prepare("INSERT INTO jobs(status,topic,reason) VALUES('scoring',?,'mencari peluang evergreen')").bind(category).run(),id=q.meta.last_row_id;
 try{
  const o=await opportunity(category,s.research_provider||"brave",env,s),b=o.best;
  const status=b&&b.decision==="CONTINUE"?"researched":"rejected",reason=b?`skor ${b.score}/100 · ${b.source_count} sumber · ${b.domain_count} domain · ${b.intent}`:"tidak ada kandidat";
  await env.DB.prepare("UPDATE jobs SET status=?,keyword=?,score=?,reason=?,article_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,b?.query||"",b?.score||0,reason,JSON.stringify({opportunity:o,research:b?.research||null}),id).run();
  return{ok:true,job_id:id,topic:category,opportunity:o};
 }catch(e){await env.DB.prepare("UPDATE jobs SET status='error',reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(e.message,id).run();return{ok:false,job_id:id,error:e.message};}
}
export default{async fetch(req,env){const u=new URL(req.url);
 if(u.pathname==="/login"&&req.method==="POST"){if(!env.ADMIN_PASSWORD)return json({ok:false,error:"ADMIN_PASSWORD belum dipasang"},503);const b=await req.json();if(String(b.password||"")!==String(env.ADMIN_PASSWORD))return json({ok:false,error:"Password salah"},401);const token=await sessionToken(String(env.ADMIN_PASSWORD));return json({ok:true},200,{"set-cookie":`zea_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`});}
 if(u.pathname==="/logout"&&req.method==="POST")return json({ok:true},200,{"set-cookie":"zea_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"});
 const auth=await authorized(req,env);
 if(u.pathname==="/"||u.pathname==="/dashboard")return new Response(dashboard,{headers:{"content-type":"text/html;charset=UTF-8"}});
 if(u.pathname.startsWith("/api/")&&!auth)return json({ok:false,error:"unauthorized"},401);
 if(u.pathname==="/api/status"){const s=await settings(env);const jobs=await env.DB.prepare("SELECT * FROM jobs ORDER BY id DESC LIMIT 20").all();return json({settings:s,jobs:jobs.results,providers:providerState(env),llm:llmState(env)});}
 if(u.pathname==="/api/settings"&&req.method==="POST"){const body=await req.json(),allowed=["enabled","mode","active_start","active_end","daily_limit","min_publish_score","min_review_score","topics","research_provider","llm_provider","llm_model"];for(const k of allowed)if(body[k]!==undefined)await env.DB.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(k,String(body[k])).run();return json({ok:true,settings:await settings(env)});}
 if(u.pathname==="/api/research-test"&&req.method==="POST"){const b=await req.json(),s=await settings(env);try{return json({ok:true,...await researchTopic(b.topic||"pengetahuan umum",b.provider||s.research_provider||"brave",env)});}catch(e){return json({ok:false,error:e.message},400);}}
 if(u.pathname==="/api/opportunity-test"&&req.method==="POST"){const b=await req.json(),s=await settings(env);try{return json({ok:true,...await opportunity(b.category||"pengetahuan umum",b.provider||s.research_provider||"brave",env,s)});}catch(e){return json({ok:false,error:e.message},400);}}
 if(u.pathname==="/api/evidence-test"&&req.method==="POST"){const b=await req.json(),s=await settings(env);try{const o=await opportunity(b.category||"pengetahuan umum",b.provider||s.research_provider||"brave",env,s);if(!o.best||o.best.decision!=="CONTINUE")return json({ok:false,error:"Tidak ada kandidat yang lolos"},400);const ledger=await evidenceLedger(o.best.query,o.best.research,s,env);return json({ok:true,topic:o.best.query,score:o.best.score,editorial_fit:o.best.editorial_fit,evidence:ledger});}catch(e){return json({ok:false,error:e.message},400);}}
 if(u.pathname==="/api/writer-test"&&req.method==="POST"){const b=await req.json(),s=await settings(env);try{const o=await opportunity(b.category||"pengetahuan umum",b.provider||s.research_provider||"brave",env,s);if(!o.best||o.best.decision!=="CONTINUE")return json({ok:false,error:"Tidak ada kandidat yang lolos Opportunity Gate"},400);let research=o.best.research,ledger=await evidenceLedger(o.best.query,research,s,env),balanced=balanceEvidence(ledger),enriched=false;
 if(!ledger.ready||!balanced.ready){
  const extra=await researchQuery(o.best.query+" sumber resmi jurnal panduan teknologi manfaat keterbatasan",b.provider||s.research_provider||"brave",env);
  research=mergeResearch(research,extra);ledger=await evidenceLedger(o.best.query,research,s,env);balanced=balanceEvidence(ledger);enriched=true;
 }
 if(!ledger.ready)return json({ok:false,error:"Evidence Ledger belum READY setelah riset pengayaan",topic:o.best.query,enriched,evidence:ledger},400);
 if(!balanced.ready)return json({ok:false,error:"Evidence belum cukup untuk Writer setelah riset pengayaan",topic:o.best.query,enriched,balanced,evidence_summary:{usable:ledger.usable_count,core:ledger.core_usable_count,coverage:ledger.coverage}},400);
 const preview=await writerPreview(o.best.query,ledger,s,env);return json({ok:true,topic:o.best.query,score:o.best.score,enriched,evidence_summary:{usable:ledger.usable_count,core:ledger.core_usable_count,coverage:ledger.coverage},...preview});}catch(e){return json({ok:false,error:e.message},400);}}
 if(u.pathname==="/api/run"&&req.method==="POST")return json(await runCycle(env,"manual"));
 return json({error:"not_found"},404);},async scheduled(event,env,ctx){ctx.waitUntil(runCycle(env,"cron"))}};
