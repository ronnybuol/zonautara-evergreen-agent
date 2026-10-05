const evergreenPatterns=[
  c=>`panduan ${c.toLowerCase()} untuk pemula`,
  c=>`cara memilih ${c.toLowerCase()} yang tepat`,
  c=>`kesalahan umum dalam ${c.toLowerCase()}`,
  c=>`fakta penting tentang ${c.toLowerCase()}`,
  c=>`tips ${c.toLowerCase()} yang perlu diketahui`
];
const current=/\b(202[0-9]|hari ini|terbaru|terkini|breaking|viral|update|jadwal|harga hari ini|pilkada|pemilu)\b/i;
const howto=/\b(cara|panduan|tips|langkah|memilih|mengatasi|membuat)\b/i;
const explain=/\b(apa|mengapa|fakta|jenis|fungsi|manfaat|perbedaan|kesalahan)\b/i;

function intentOf(q){return howto.test(q)?"how-to":explain.test(q)?"informational":"informational";}
function scoreCandidate(q,r){
 const evidence=Math.min(30,r.results.length*4);
 const diversity=Math.min(25,r.domain_count*4);
 const evergreen=current.test(q)?0:20;
 const intent=(howto.test(q)||explain.test(q))?15:10;
 const longtail=q.trim().split(/\s+/).length>=4?10:5;
 return Math.max(0,Math.min(100,evidence+diversity+evergreen+intent+longtail));
}
export function candidateQueries(category){
 return evergreenPatterns.map(fn=>fn(category)).filter(q=>!current.test(q));
}
export function evaluateCandidate(query,research){
 const score=scoreCandidate(query,research),intent=intentOf(query);
 return {query,intent,score,evergreen:!current.test(query),source_count:research.results.length,domain_count:research.domain_count,decision:research.enough&&score>=70?"CONTINUE":"SKIP"};
}
