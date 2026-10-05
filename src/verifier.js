function indonesianScore(text){
 const s=" "+String(text||"").toLowerCase().replace(/[^a-zà-ÿ\s]/gi," ")+" ";
 const id=[" yang "," dan "," untuk "," dengan "," dalam "," pada "," dari "," dapat "," sebagai "," adalah "," petani "," pertanian "," metode "," berdasarkan "];
 const en=[" the "," and "," for "," with "," in "," of "," can "," as "," is "," are "," farmers "," agriculture "," methods "," based "];
 return id.reduce((n,x)=>n+(s.includes(x)?1:0),0)-en.reduce((n,x)=>n+(s.includes(x)?1:0),0);
}
export function languageGate(article){
 const text=[article.title,article.dek,...(article.sections||[]).flatMap(s=>[s.heading,...s.paragraphs.map(p=>p.text)])].join(" ");
 const score=indonesianScore(text);
 return {language:"id",score,pass:score>=0};
}
export function verifierPrompt(article,balanced){
 const paragraphs=[];let n=0;
 for(const section of article.sections||[])for(const p of section.paragraphs||[]){
  n++;paragraphs.push({paragraph_id:n,text:p.text,claim_ids:p.claim_ids,claims:(p.claim_ids||[]).map(id=>({claim_id:id,claim:balanced.claims[id-1]?.claim||""}))});
 }
 return "Anda adalah fact checker independen. Nilai SETIAP paragraf hanya terhadap claims yang disertakan pada paragraf itu. Jangan memakai pengetahuan sendiri dan jangan mencari pembenaran dari claim lain. Tandai unsupported bila ada fakta, angka, hubungan sebab-akibat, manfaat, penilaian, generalisasi, atau kesimpulan yang tidak secara langsung didukung claims. Frasa transisi netral boleh. Output HANYA JSON: {paragraphs:[{paragraph_id:1,status:\"supported|partial|unsupported\",unsupported_text:[\"...\"],reason:\"...\"}],overall:\"PASS|REVIEW|REJECT\"}. PASS hanya jika semua supported; REVIEW jika ada partial tetapi tidak ada unsupported; REJECT jika ada unsupported. PARAGRAPHS: "+JSON.stringify(paragraphs);
}
export function finalizeVerification(data,article,language,model){
 const total=(article.sections||[]).reduce((n,s)=>n+(s.paragraphs||[]).length,0);
 const raw=Array.isArray(data.paragraphs)?data.paragraphs:[],byId=new Map(raw.map(x=>[Number(x.paragraph_id),x]));
 const paragraphs=[];
 for(let id=1;id<=total;id++){
  const x=byId.get(id)||{},status=["supported","partial","unsupported"].includes(x.status)?x.status:"unsupported";
  paragraphs.push({paragraph_id:id,status,unsupported_text:Array.isArray(x.unsupported_text)?x.unsupported_text.map(String):[],reason:String(x.reason||"").trim()});
 }
 const supported=paragraphs.filter(x=>x.status==="supported").length,partial=paragraphs.filter(x=>x.status==="partial").length,unsupported=paragraphs.filter(x=>x.status==="unsupported").length;
 let decision=!language.pass?"REJECT":unsupported?"REJECT":partial?"REVIEW":"PASS";
 if(String(data.overall||"").toUpperCase()==="REJECT")decision="REJECT";
 return {model,language,paragraphs,summary:{total,supported,partial,unsupported,support_ratio:total?Number((supported/total).toFixed(2)):0},decision,ready:decision==="PASS"};
}
