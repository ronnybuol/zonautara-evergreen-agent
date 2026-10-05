const clean=s=>String(s||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();

async function brave(query,env){
 const token=String(env.BRAVE_SEARCH_API_KEY||"").trim();\n if(!token) throw new Error("BRAVE_SEARCH_API_KEY belum dipasang");
 const u=new URL("https://api.search.brave.com/res/v1/web/search");u.searchParams.set("q",query);u.searchParams.set("count","10");u.searchParams.set("search_lang","id");u.searchParams.set("ui_lang","en-US");u.searchParams.set("safesearch","moderate");
 const r=await fetch(u,{headers:{"Accept":"application/json","X-Subscription-Token":token}});
 if(!r.ok){let detail="";try{const e=await r.json();detail=e?.error?.detail||e?.error?.code||JSON.stringify(e)}catch{detail=await r.text()}throw new Error("Brave Search HTTP "+r.status+(detail?": "+detail:""));}
 const d=await r.json();return (d.web?.results||[]).map(x=>({title:clean(x.title),url:x.url,snippet:clean(x.description),source:"brave"}));
}
async function tavily(query,env){
 if(!env.TAVILY_API_KEY) throw new Error("TAVILY_API_KEY belum dipasang");
 const r=await fetch("https://api.tavily.com/search",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({api_key:env.TAVILY_API_KEY,query,search_depth:"advanced",max_results:10,include_answer:false})});
 if(!r.ok) throw new Error("Tavily HTTP "+r.status);
 const d=await r.json();return (d.results||[]).map(x=>({title:clean(x.title),url:x.url,snippet:clean(x.content),source:"tavily"}));
}
const blocked=/\b(news|berita|breaking|hari ini|kemarin|terbaru|viral|update|live)\b/i;
export async function researchTopic(topic,provider,env){
 const query=topic+" panduan fakta penjelasan tips Indonesia";
 const results=provider==="tavily"?await tavily(query,env):await brave(query,env);
 const safe=results.filter(x=>x.url&&x.title&&!blocked.test(x.title)).slice(0,8);
 const domains=[...new Set(safe.map(x=>{try{return new URL(x.url).hostname.replace(/^www\./,"")}catch{return""}}).filter(Boolean))];
 return {query,provider,results:safe,domain_count:domains.length,enough:safe.length>=4&&domains.length>=3};
}
export function providerState(env){return {brave:!!env.BRAVE_SEARCH_API_KEY,tavily:!!env.TAVILY_API_KEY};}
