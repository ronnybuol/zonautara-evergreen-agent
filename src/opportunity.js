const current=/\b(202[0-9]|hari ini|terbaru|terkini|breaking|viral|update|jadwal|harga hari ini|pilkada|pemilu)\b/i;
const howto=/\b(cara|panduan|tips|langkah|memilih|mengatasi|membuat|menanam|merawat|budidaya)\b/i;
const explain=/\b(apa|mengapa|fakta|jenis|fungsi|manfaat|perbedaan|kesalahan|ciri|penyebab)\b/i;
const generic=/^(panduan|tips|fakta|cara|kesalahan).{0,18}\b(pertanian|teknologi|sains|pendidikan|lingkungan|geografi|sejarah)\b/i;
const commercial=/\b(harga|beli|jual|produk|promo|diskon|kredit|pinjaman|supplier|toko)\b/i;
const authorityDomains=/\.(go\.id|ac\.id)$/i;
const trusted=/\b(brin\.go\.id|bps\.go\.id|pertanian\.go\.id|kemkes\.go\.id|bmkg\.go\.id|who\.int|fao\.org|un\.org|worldbank\.org|wikipedia\.org)\b/i;

export function intentOf(q){return howto.test(q)?"how-to":explain.test(q)?"informational":"informational";}
function domainOf(url){try{return new URL(url).hostname.replace(/^www\./,"")}catch{return""}}
function authorityCount(results){return new Set(results.map(x=>domainOf(x.url)).filter(d=>authorityDomains.test(d)||trusted.test(d))).size}
function commercialShare(results){if(!results.length)return 0;return results.filter(x=>commercial.test((x.title||"")+" "+(x.snippet||""))).length/results.length}
function specificity(q){
 const words=q.toLowerCase().trim().split(/\s+/).filter(Boolean),unique=new Set(words).size;
 let s=unique>=5?15:unique>=4?11:unique>=3?7:3;
 if(generic.test(q))s-=8;
 if(/\b(yang perlu diketahui|tentang|untuk pemula)\b/i.test(q)&&words.length<6)s-=3;
 return Math.max(0,s);
}
export function discoverQueries(category,seedResearch){
 const stop=new Set(["panduan","lengkap","tips","cara","untuk","pemula","indonesia","dengan","yang","dan","dari","dalam","tentang",category.toLowerCase()]);
 const freq=new Map();
 for(const r of seedResearch.results||[]){
  const text=((r.title||"")+" "+(r.snippet||"")).toLowerCase().replace(/[^a-z0-9à-ÿ\s-]/gi," ");
  for(const w of text.split(/\s+/)){if(w.length<5||stop.has(w)||/^202\d$/.test(w))continue;freq.set(w,(freq.get(w)||0)+1)}
 }
 const terms=[...freq.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(x=>x[0]);
 const patterns=[];
 for(const t of terms.slice(0,5)){patterns.push(`cara ${t} dalam ${category.toLowerCase()}`)}
 patterns.push(`kesalahan umum ${category.toLowerCase()} dan cara menghindarinya`);
 return [...new Set(patterns)].filter(q=>!current.test(q)).slice(0,6);
}
export function evaluateCandidate(query,research){
 const auth=authorityCount(research.results),commerce=commercialShare(research.results);
 const evidence=Math.min(18,research.results.length*2.25);
 const diversity=Math.min(16,research.domain_count*2);
 const authority=Math.min(22,auth*7);
 const evergreen=current.test(query)?0:15;
 const intent=(howto.test(query)||explain.test(query))?10:6;
 const specific=specificity(query);
 const commercialPenalty=Math.round(commerce*18);
 const genericPenalty=generic.test(query)?12:0;
 const score=Math.max(0,Math.min(100,Math.round(evidence+diversity+authority+evergreen+intent+specific-commercialPenalty-genericPenalty)));
 return {query,intent:intentOf(query),score,evergreen:!current.test(query),source_count:research.results.length,domain_count:research.domain_count,authority_domains:auth,commercial_share:Number(commerce.toFixed(2)),decision:research.enough&&score>=68?"CONTINUE":"SKIP"};
}
