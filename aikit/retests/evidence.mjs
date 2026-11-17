export function requiredBugAssertions(spec){
 switch(spec?.driver){
  case 'german':return ['marketing-address','faq-address','reported-formal-phrases','mixed-formal-address'];
  case 'rtl-overflow':return Array.isArray(spec.targets)?spec.targets.flatMap(path=>['rtl-'+path,...['initial','horizontal-scroll','skip-focus'].flatMap(phase=>[path+'-'+phase+'-viewport',path+'-'+phase+'-width'])]):[];
  case 'upload-limits':return Array.isArray(spec.targets)&&spec.targets.length===3?[spec.targets[0],spec.targets[2]].flatMap(path=>[path+'-general-limit',path+'-audio-exception',path+'-faq-audio']).concat('help-audio-limit'):[];
  case 'document-import':return ['QA-import.docx','QA-import.pdf'].flatMap(name=>['paragraph-count','paragraph-boundaries','blank-line-sequence'].map(id=>name+'-'+id));
  case 'text-transform':return ['paragraph-count','required-content','title-preserved','golden-semantic-reference'];
  case 'editor-overflow':return [0,1].flatMap(i=>['viewport-','document-width-','target-bounds-','target-visible-'].map(prefix=>prefix+i));
  default:return [];
 }
}
export function hasBugEvidence(result){
 const required=requiredBugAssertions(result?.spec);
 return result?.executed===true&&result.technicalSuccess===true&&required.length>0&&Array.isArray(result.assertions)&&result.assertions.length>0&&result.assertions.every(a=>a.passed===true)&&required.every(id=>result.assertions.some(a=>a.id===id&&a.passed===true));
}
