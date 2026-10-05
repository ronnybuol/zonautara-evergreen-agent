const current=/\b(202[0-9]|hari ini|terbaru|terkini|breaking|viral|update|jadwal|harga hari ini|pilkada|pemilu)\b/i;
const howto=/\b(cara|panduan|tips|langkah|memilih|mengatasi|membuat|menanam|merawat|budidaya|teknik)\b/i;
const explain=/\b(apa|mengapa|fakta|jenis|fungsi|manfaat|perbedaan|kesalahan|ciri|penyebab|sistem)\b/i;
const commercial=/\b(harga|beli|jual|produk|promo|diskon|kredit|pinjaman|supplier|toko)\b/i;
const authorityDomains=/\.(go\.id|ac\.id)$/i;
const trusted=/\b(brin\.go\.id|bps\.go\.id|pertanian\.go\.id|kemkes\.go\.id|bmkg\.go\.id|who\.int|fao\.org|un\.org|worldbank\.org)\b/i;
const noise=/\b(panduan|lengkap|artikel|mengenal|kenali|contoh|mulai|memulai|indonesia|pemula|terbaru|praktis|baik|bidang|prodi)\b/i;

export function intentOf(q){return howto.test(q)?"how-to":explain.test(q)?"informational":"informational";}
function domainOf(url){try{return new URL(url).hostname.replace(/^www\./,"")}catch{return""}}
function authorityCount(results){return new Set(results.map(x=>domainOf(x.url)).filter(d=>authorityDomains.test(d)||trusted.test(d))).size}
function commercialShare(results){if(!results.length)return 0;return results.filter(x=>commercial.test((x.title||"")+" "+(x.snippet||""))).length/results.length}
function norm(s){return String(s||"").toLowerCase().replace(/[–—|:;,()[\]!?]/g," ").replace(/[^a-z0-9à-ÿ\s-]/gi," ").replace(/\s+/g," ").trim()}
function usefulPhrase(p,category){
 const w=p.split(" ").filter(Boolean),cat=category.toLowerCase();
 if(w.length<2||w.length>6||current.test(p)||badEdge.test(p)||/^(?:\\d+\\s+|www\\b)/i.test(p))return false;
 if(w.every(x=>x===cat||noise.test(x)))return false;
 if(/^(cara|panduan|tips|fakta|artikel|contoh)\s*$/.test(p))return false;
 return true;
}
export function discoverQueries(category,seedResearch){
 const cat=category.toLowerCase(),scores=new Map();
 const add=(p,weight)=>{p=norm(p).replace(noise,"").replace(/\s+/g," ").trim();if(!usefulPhrase(p,category))return;scores.set(p,(scores.get(p)||0)+weight)};
 for(const r of seedResearch.results||[]){
  const title=norm(r.title),snippet=norm(r.snippet);
  const titleWords=title.split(" ");
  for(let n=2;n<=5;n++)for(let i=0;i<=titleWords.length-n;i++){const p=titleWords.slice(i,i+n).join(" ");if(p.includes(cat))add(p,4+n)}
  const patterns=[
   /\b(teknik\s+[a-zà-ÿ-]+(?:\s+[a-zà-ÿ-]+){0,2})\b/gi,
   /\b(sistem\s+[a-zà-ÿ-]+(?:\s+[a-zà-ÿ-]+){0,2})\b/gi,
   /\b(pengolahan\s+[a-zà-ÿ-]+(?:\s+[a-zà-ÿ-]+){0,2})\b/gi,
   /\b(pemilihan\s+[a-zà-ÿ-]+(?:\s+[a-zà-ÿ-]+){0,2})\b/gi,
   /\b(pengendalian\s+[a-zà-ÿ-]+(?:\s+[a-zà-ÿ-]+){0,2})\b/gi,
   /\b(pertanian\s+(?:organik|modern|berkelanjutan|terpadu))\b/gi,
   /\b(budidaya\s+[a-zà-ÿ-]+(?:\s+[a-zà-ÿ-]+){0,2})\b/gi
  ];
  for(const re of patterns)for(const m of (title+" "+snippet).matchAll(re))add(m[1],8);
 }
 let ranked=[...scores.entries()].sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
 ranked=ranked.filter((q,i,a)=>!a.some((other,j)=>j<i&&other.includes(q)&&other!==q));
 if(ranked.length<4){
  const fallbacks=[`teknik dasar ${cat}`,`sistem ${cat} di Indonesia`,`${cat} berkelanjutan`,`kesalahan umum dalam ${cat}`];
  for(const q of fallbacks)if(!ranked.includes(q))ranked.push(q);
 }
 return ranked.slice(0,6);
}
function specificity(q){
 const words=q.trim().split(/\s+/).filter(Boolean),unique=new Set(words).size;
 let s=unique>=5?15:unique>=4?13:unique>=3?10:6;
 if(/^(pertanian|teknologi|sains|pendidikan|lingkungan|geografi|sejarah)$/i.test(q))s=0;
 return s;
}
export function evaluateCandidate(query,research){
 const auth=authorityCount(research.results),commerce=commercialShare(research.results);
 const evidence=Math.min(18,research.results.length*2.25),diversity=Math.min(16,research.domain_count*2),authority=Math.min(22,auth*7);
 const evergreen=current.test(query)?0:15,intent=(howto.test(query)||explain.test(query))?10:7,specific=specificity(query);
 const commercialPenalty=Math.round(commerce*18);
 const score=Math.max(0,Math.min(100,Math.round(evidence+diversity+authority+evergreen+intent+specific-commercialPenalty)));
 return {query,intent:intentOf(query),score,evergreen:!current.test(query),source_count:research.results.length,domain_count:research.domain_count,authority_domains:auth,commercial_share:Number(commerce.toFixed(2)),decision:research.enough&&score>=68?"CONTINUE":"SKIP"};
}
