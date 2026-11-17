const UI=new Set(`Tools|Tool library|Home|Projects|Things you build|Your websites|My projects|Stock voices|All 60 stock voices|Voice Kit|Audio Kit|Site Plan|Bring in a site|Live Chat|Languages|Website modules|Pro Designer Automate|Open menu|Close menu|Menu|Close|Back|Next|Previous|Search|Search tools|Filters|Filter|Sort|Category|View|Overview|Settings|Required|This field is required|Invalid email|Please enter a valid email address|Cancel|Show more|Show all|Hide|Expand|Collapse|Light|Dark|English|Play|Pause|Preview|Help|Library|Your time|Checklist|Your work items|How this tool works|Upload|Download|Export|Import|Save|Undo|Redo|Trim|Noise reduction|Remove noise|Edit|Add file|Choose file|Choose files|Select files|Drag and drop|Open file|My audio|My files|Your script|Your voice|Read|Hear|Apply|Restore|History|Versions|Pricing|Quote|Contact form|Lead capture|Submit|Required field|File too large|Unsupported file|Video Kit|Writing Pack|Motion Maker|Music Maker|Save to Graphics Library|Retry|Start|Stop|Continue`.toLowerCase().split('|'));
const REASONS=new Set('OBSERVATION_CAPTURED ACTION_OBSERVED ASSERTIONS_VERIFIED ASSERTION_FAILED NOT_EXECUTED STALE_TARGET AMBIGUOUS_TARGET TARGET_NOT_FOUND TARGET_DISABLED STALE_OPTION INSPECTION_REQUIRED NO_ACTED_TARGET URL_NOT_ALLOWED URL_QUERY_NOT_ALLOWED URL_ACTION_BLOCKED LOCAL_SCOPED_AUTHORIZATION_REQUIRED LOCAL_AUTHORIZATION_SCOPE_MISMATCH CAPABILITY_DISABLED FORM_SUBMISSION_BLOCKED LOCAL_LOGIN_REQUIRED INTERRUPTED EXECUTION_BUDGET_EXCEEDED BROWSER_OPERATION_FAILED CLICK_INTERCEPTED TARGET_OUTSIDE_VIEWPORT NAVIGATION_RACE ACTION_TIMEOUT BROWSER_UNAVAILABLE UNKNOWN_CHECKLIST_ITEM INTERRUPTED_NO_REPLAY LOCAL_REVIEW_REQUIRED'.split(' '));
export const safeReason=value=>REASONS.has(value)?value:'LOCAL_REVIEW_REQUIRED';
REASONS.add('LOCAL_STORAGE_UNAVAILABLE');
UI.add('dismiss backdrop');
export function safeLabel(value) {
  if(typeof value!=='string')return '[private text]';
  const normalized=value.replace(/\s+/g,' ').trim();
  return UI.has(normalized.toLowerCase())?normalized:'[private text]';
}
export function safePath(url) {
  try {
    const path=new URL(url).pathname;
    if(/^\/(?:[a-z]{2}(?:-[a-z]+)?)?$/i.test(path)||path==='/home/projects'||path==='/home/connect'||path==='/catalog/site-plan'||path==='/tools/connect'||path==='/tools')return path;
    if(/^\/tools\/[a-z-]{1,40}$/.test(path)&&UI.has(path.slice(7).replaceAll('-',' ')))return path;
    return path.startsWith('/tools/')?'/tools/:private':path.startsWith('/home/')?'/home/:private':'/:private';
  }catch{return '/:private';}
}
const safePixel=value=>Number.isSafeInteger(value)&&value>=0&&value<=1_000_000?value:0;
export function safeObservation(snapshot) {
  if(!snapshot)return null;
  const validId=value=>typeof value==='string'&&/^[es]_[a-f0-9]{24}$/.test(value);
  return {
    sessionId:/^[a-f0-9-]{36}$/.test(snapshot.sessionId||'')?snapshot.sessionId:null,
    snapshotId:validId(snapshot.snapshotId)?snapshot.snapshotId:null,
    route:safePath(snapshot.url||'https://invalid.local/'),
    viewport:['desktop','mobile'].includes(snapshot.viewport)?snapshot.viewport:'desktop',
    headings:(snapshot.headings||[]).slice(0,12).map(safeLabel),
    validationMessages:(snapshot.validationMessages||[]).slice(0,10).map(safeLabel),
    semantics:Object.fromEntries(['forms','invalidFields','requiredFields','fileInputs','downloadControls','dialogs','progressIndicators','alerts'].map(key=>[key,Math.min(1000,safePixel(snapshot.semantics?.[key]))])),
    // Strict numeric projection: never return DOM text, selectors or elementFromPoint metadata.
    layout:snapshot.layout&&typeof snapshot.layout==='object'?{
      viewportWidth:safePixel(snapshot.layout.viewportWidth),
      documentWidth:safePixel(snapshot.layout.documentWidth),
      horizontalOverflowPx:safePixel(snapshot.layout.horizontalOverflowPx),
      scrollHeight:safePixel(snapshot.layout.scrollHeight),
      scrollY:safePixel(snapshot.layout.scrollY)
    }:null,
    controls:(snapshot.controls||[]).slice(0,60).filter(control=>validId(control.elementId)).map(control=>({
      elementId:control.elementId,
      role:['button','link','textbox','searchbox','combobox','tab','checkbox','radio','slider','other'].includes(control.role)?control.role:'other',
      label:safeLabel(control.label),
      kind:['navigation','disclosure','search','filter','editable','sensitive','backdrop','other'].includes(control.kind)?control.kind:'other',
      enabled:control.enabled===true,ambiguous:control.ambiguous===true,hitTest:['clear','obstructed','offscreen'].includes(control.hitTest)?control.hitTest:'unknown',
      ...(typeof control.expanded==='boolean'?{expanded:control.expanded}:{}),
      field:control.field?{required:control.field.required===true,invalid:control.field.invalid===true,readOnly:control.field.readOnly===true,multiline:control.field.multiline===true,multiple:control.field.multiple===true,inputKind:['text','search','email','number','password','file','checkbox','radio','other'].includes(control.field.inputKind)?control.field.inputKind:'other'}:null,
      allowedOps:(control.allowedOps||[]).filter(op=>['click','dismiss','fill','press','select','inspect'].includes(op)),
      options:(control.allowedOps?.includes('select')?control.options||[]:[]).slice(0,12).filter(option=>/^o_[a-f0-9]{24}$/.test(option.optionId||'')).map(option=>({optionId:option.optionId,label:safeLabel(option.label),selected:option.selected===true}))
    })),
    truncated:snapshot.truncated===true,
    evidence:'LOCAL_ONLY',officialItemsAutoCompleted:0
  };
}
export function safeBrowserResult(result) {
  const safe={
    status:['COMPLETED','BLOCKED','REVIEW_REQUIRED'].includes(result?.status)?result.status:'BLOCKED',
    reason:safeReason(result?.reason),
    observation:safeObservation(result?.observation),
    steps:(result?.steps||[]).slice(0,6).map(step=>({index:step.index,op:['click','dismiss','fill','press','select','scroll','back','inspect','open','reset'].includes(step.op)?step.op:'inspect',status:['PASS','FAIL','BLOCKED','NOT TESTED'].includes(step.status)?step.status:'BLOCKED',reason:safeReason(step.reason),assertions:(step.assertions||[]).slice(0,3).map(assertion=>({type:['visible','hidden','enabled','expanded','textEquals','urlPath'].includes(assertion.type)?assertion.type:'visible',passed:assertion.passed===true})),observation:safeObservation(step.observation)})),
    officialItemsAutoCompleted:0
  };
  for(const [index,step] of safe.steps.entries())step.index=index;
  const observations=[safe.observation,...safe.steps.map(step=>step.observation)].filter(Boolean);
  while(JSON.stringify(safe).length>24_000) {
    const largest=observations.filter(o=>o.controls.length).sort((a,b)=>JSON.stringify(b).length-JSON.stringify(a).length)[0];
    if(!largest)break;largest.controls.pop();largest.truncated=true;
  }
  return safe;
}
