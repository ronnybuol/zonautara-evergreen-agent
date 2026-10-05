function words(s){return String(s||"").trim().split(/\s+/).filter(Boolean).length}
export function qualityGate(article,verification,balanced){
 const paragraphs=(article.sections||[]).flatMap(s=>s.paragraphs||[]);
 const wordCount=paragraphs.reduce((n,p)=>n+words(p.text),0);
 const domains=new Set((article.sources||[]).map(s=>s.domain).filter(Boolean));
 const authoritative=(article.sources||[]).filter(s=>s.tier<=2).length;
 const claimCoverage=balanced.total?article.used_claim_ids.length/balanced.total:0;
 const checks={
  fact_pass:verification?.decision==="PASS",
  language_pass:!!verification?.language?.pass,
  min_paragraphs:paragraphs.length>=4,
  min_words:wordCount>=350,
  source_diversity:domains.size>=2,
  authoritative_source:authoritative>=1,
  claim_coverage:claimCoverage>=0.7,
  title_length:words(article.title)>=5&&String(article.title||"").length<=90,
  meta_length:String(article.meta_description||"").length>=80&&String(article.meta_description||"").length<=155
 };
 let score=0;
 score+=checks.fact_pass?30:0;
 score+=checks.language_pass?10:0;
 score+=checks.min_paragraphs?10:0;
 score+=checks.min_words?15:0;
 score+=checks.source_diversity?10:0;
 score+=checks.authoritative_source?10:0;
 score+=checks.claim_coverage?5:0;
 score+=checks.title_length?5:0;
 score+=checks.meta_length?5:0;
 const blockers=[];
 if(!checks.fact_pass)blockers.push("Fact Checker belum PASS");
 if(!checks.language_pass)blockers.push("Bahasa artikel tidak lolos");
 if(!checks.min_paragraphs)blockers.push("Artikel terlalu tipis: kurang dari 4 paragraf isi");
 if(!checks.min_words)blockers.push("Artikel terlalu pendek: "+wordCount+" kata");
 if(!checks.source_diversity)blockers.push("Keragaman sumber kurang dari 2 domain");
 let decision=score>=90?"PUBLISH":score>=75?"REVIEW":"REJECT";
 if(!checks.fact_pass||!checks.language_pass)decision="REJECT";
 if(decision==="PUBLISH"&&(!checks.min_words||!checks.min_paragraphs))decision="REVIEW";
 return {score,decision,ready:decision==="PUBLISH",metrics:{word_count:wordCount,paragraph_count:paragraphs.length,section_count:(article.sections||[]).length,source_domains:domains.size,authoritative_sources:authoritative,claim_coverage:Number(claimCoverage.toFixed(2))},checks,blockers};
}
