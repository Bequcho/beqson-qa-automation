export const normalize=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
export const paragraphs=s=>String(s||'').replace(/\r\n/g,'\n').split(/\n\s*\n/).map(normalize).filter(Boolean);
export const quoted=s=>[...String(s||'').matchAll(/["“]([^"”\n]{2,500})["”]/g)].map(m=>m[1]);
export const assertion=(id,passed,expected,actual)=>({id,passed:passed===null?null:passed===true,expected,actual});
export function verdict(assertions,{review=false,reason='BUG_ASSERTIONS_VERIFIED'}={}){
 if(!assertions.length)return {status:'REVIEW_REQUIRED',reason:'NO_BUG_ASSERTIONS',assertions};
 if(assertions.some(a=>a.passed===false))return {status:'FAIL',reason:'BUG_REGRESSION_REPRODUCED',assertions};
 if(review||assertions.some(a=>a.passed!==true))return {status:'REVIEW_REQUIRED',reason:review?reason:'ORACLE_REVIEW_REQUIRED',assertions};
 return {status:'PASS',reason,assertions};
}
export function addressComparison({marketing,faq,oldPhrases=[]}){
 const informal=t=>(t.match(/\b(?:du|dir|dich|dein\w*)\b/gi)||[]).length;
 const forbidden=oldPhrases.filter(p=>normalize(faq).includes(normalize(p)));
 const formalCertain=/\bIhnen\b/.test(faq),ambiguous=/\bSie\b/.test(faq);
 return verdict([
  assertion('marketing-address',informal(marketing)>0?true:null,'Informal marketing address is actually present',informal(marketing)),
  assertion('faq-address',informal(faq)>0?true:null,'FAQ contains informal address',informal(faq)),
  assertion('reported-formal-phrases',forbidden.length===0,'Original reported formal wording is absent',forbidden),
  assertion('mixed-formal-address',!formalCertain,'No formal Ihnen address among the FAQ text',formalCertain)
 ],{review:ambiguous&&!forbidden.length&&!formalCertain,reason:ambiguous?'LINGUISTIC_REVIEW_REQUIRED':'REGISTERED_ADDRESS_CHECKS_VERIFIED'});
}
export function paragraphComparison(source,actual){
 const before=paragraphs(source),after=paragraphs(actual);
 return verdict([assertion('paragraph-count',before.length===after.length,before.length,after.length),assertion('paragraph-boundaries',before.every((p,i)=>p===after[i]),before,after),assertion('blank-line-sequence',source.replace(/\r\n/g,'\n').trimEnd()===actual.replace(/\r\n/g,'\n').trimEnd(),source,actual)]);
}
export function transformationComparison({source,actual,sourceTitle,actualTitle,required=[],entities=[],golden}){
 const before=paragraphs(source),after=paragraphs(actual),missing=[...required,...entities].filter(s=>!actual.includes(s));
 const checks=[assertion('paragraph-count',before.length===after.length,before.length,after.length),assertion('required-content',!missing.length,[...required,...entities],missing),assertion('title-preserved',sourceTitle===actualTitle,sourceTitle,actualTitle)];
 if(golden!==undefined)checks.push(assertion('golden-semantic-reference',normalize(actual)===normalize(golden),golden,actual));
 return verdict(checks,{review:golden===undefined,reason:'SEMANTIC_REVIEW_REQUIRED'});
}
export function pronunciationComparison(text,{audioRequested=false}={}){
 const standard=/\bpe-da-LE-a\b/.test(text),wrong=/pe-da-LEA|PE-da-lea|pe-DAL-ea/.test(text);
 return verdict([assertion('standard-stress',standard,'Four syllables with stress on the penultimate le',standard),assertion('incorrect-standard',!wrong,'No incorrect form presented as standard',wrong)],{review:audioRequested,reason:'AUDIO_REVIEW_REQUIRED'});
}
export function overflowComparison(samples,width){return verdict(samples.flatMap((s,i)=>[
 assertion('viewport-'+i,s.viewportWidth===width,width,s.viewportWidth),
 assertion('document-width-'+i,s.documentWidth<=width+1,'Document fits CSS viewport',s.documentWidth),
 assertion('target-bounds-'+i,s.targetLeft>=-1&&s.targetRight<=width+1,'The actual target component fits, not just the document',{left:s.targetLeft,right:s.targetRight}),
 assertion('target-visible-'+i,s.targetVisible===true,'The target was opened and visible',s.targetVisible)
]))}
