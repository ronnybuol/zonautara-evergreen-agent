function allText(article){
 return [article.title,article.meta_description,article.dek,...(article.sections||[]).flatMap(s=>[s.heading,...(s.paragraphs||[]).map(p=>p.text)])].join(" ");
}
export function sanityGate(article,quality){
 const text=allText(article);
 const foreignScripts=/[\u3400-\u4DBF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/u.test(text);
 const controlChars=/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text);
 const slug=/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(article.slug||""));
 const required=!!String(article.title||"").trim()&&!!String(article.meta_description||"").trim()&&!!String(article.dek||"").trim()&&(article.sections||[]).length>0;
 const meta=String(article.meta_description||"").trim();
 const metaClean=meta.length>=80&&meta.length<=155&&!/[,:;\/-]$/.test(meta);
 const html=String(article.html||"");
 const htmlClean=!/<script\b|<iframe\b|javascript:|on\w+\s*=/i.test(html);
 const checks={quality_publish:quality?.decision==="PUBLISH",no_foreign_scripts:!foreignScripts,no_control_chars:!controlChars,valid_slug:slug,required_fields:required,meta_clean:metaClean,html_clean:htmlClean};
 const failures=Object.entries(checks).filter(([,ok])=>!ok).map(([k])=>k);
 return {decision:failures.length?"REVIEW":"PUBLISH",ready:failures.length===0,checks,failures};
}
