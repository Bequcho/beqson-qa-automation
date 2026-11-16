export const BROWSER_COMMANDS=Object.freeze(['BROWSER_OPEN','BROWSER_INSPECT','BROWSER_ACT','BROWSER_BATCH','BROWSER_RESET']);
const object=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
const id=value=>typeof value==='string'&&/^[es]_[a-f0-9]{24}$/.test(value);
const text=(value,max=256)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
const fail=code=>{throw Error(code);};
export function validateTarget(target) {
  if(!object(target,['snapshotId','elementId','match','ref']))fail('INVALID_BROWSER_TARGET');
  if(target.ref==='acted' && Object.keys(target).length===1)return target;
  if(target.ref==='last'&&object(target.match,['role','label','kind'])&&Object.keys(target).length===2&&Object.keys(target.match).length&&Object.values(target.match).every(value=>text(value,80)))return target;
  if(Object.keys(target).length===2&&id(target.snapshotId)&&target.snapshotId.startsWith('s_')&&id(target.elementId)&&target.elementId.startsWith('e_'))return target;
  fail('INVALID_BROWSER_TARGET');
}
export function validateAssertion(assertion) {
  if(!object(assertion,['type','target','value']))fail('INVALID_BROWSER_ASSERTION');
  if(!['visible','hidden','enabled','expanded','textEquals','urlPath'].includes(assertion.type))fail('INVALID_BROWSER_ASSERTION');
  if(assertion.type==='urlPath') {
    if(assertion.target!==undefined||!text(assertion.value,160)||!assertion.value.startsWith('/')||/[?#\\]/.test(assertion.value))fail('INVALID_BROWSER_ASSERTION');
  }else {
    validateTarget(assertion.target);
    if(assertion.type==='textEquals'?!text(assertion.value):typeof assertion.value!=='boolean')fail('INVALID_BROWSER_ASSERTION');
  }
  return assertion;
}
export function validateAction(action) {
  if(!object(action,['op','target','value','key','optionId','direction','amount','assertions']))fail('INVALID_BROWSER_ACTION');
  const keys={click:['target'],fill:['target','value'],press:['target','key'],select:['target','optionId'],scroll:['direction','amount'],back:[],inspect:['target']}[action.op];
  if(!keys||Object.keys(action).some(key=>!['op','assertions',...keys].includes(key)))fail('INVALID_BROWSER_ACTION');
  if(keys.includes('target')) {validateTarget(action.target);if(action.target.ref==='acted')fail('ACTED_TARGET_ONLY_FOR_ASSERTIONS');}
  if(action.op==='fill'&&!text(action.value,256))fail('INVALID_BROWSER_VALUE');
  if(action.op==='fill'&&/(?:<\s*script\b|javascript:|data:text\/html|\bon\w+\s*=|\beval\s*\(|\bFunction\s*\(|\b(?:gh[pousr]_|github_pat_|sk-proj-))/i.test(action.value))fail('EXECUTABLE_OR_CREDENTIAL_INPUT_BLOCKED');
  if(action.op==='press'&&!['Escape','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Space','Home','End'].includes(action.key))fail('INVALID_BROWSER_KEY');
  if(action.op==='select'&&!(typeof action.optionId==='string'&&/^o_[a-f0-9]{24}$/.test(action.optionId)))fail('INVALID_BROWSER_OPTION');
  if(action.op==='scroll'&&(!['up','down','left','right'].includes(action.direction)||!Number.isInteger(action.amount)||action.amount<1||action.amount>1200))fail('INVALID_BROWSER_SCROLL');
  if(action.assertions!==undefined&&(!Array.isArray(action.assertions)||action.assertions.length>3))fail('INVALID_BROWSER_ASSERTION');
  action.assertions?.forEach(validateAssertion);return action;
}
export function validateBrowserCommand(command,params) {
  const keys={BROWSER_OPEN:['url','viewport','checklistId'],BROWSER_INSPECT:['checklistId'],BROWSER_ACT:['action','checklistId','authorizationId'],BROWSER_BATCH:['steps','checklistId','authorizationId'],BROWSER_RESET:[]}[command];
  if(!keys||!object(params,keys))fail('INVALID_BROWSER_PARAMETERS');
  if(params.checklistId!==undefined&&!/^official\.[a-z-]+\.\d{2}$/.test(params.checklistId))fail('INVALID_CHECKLIST_LINK');
  if(params.authorizationId!==undefined&&!/^[a-z0-9-]{1,64}$/.test(params.authorizationId))fail('INVALID_LOCAL_AUTHORIZATION_ID');
  if(command==='BROWSER_OPEN') {
    if(!text(params.url,512))fail('INVALID_BROWSER_URL');
    if(params.viewport!==undefined&&!['desktop','mobile'].includes(params.viewport))fail('INVALID_BROWSER_VIEWPORT');
  }
  if(command==='BROWSER_ACT')validateAction(params.action);
  if(command==='BROWSER_BATCH') {
    if(!Array.isArray(params.steps)||params.steps.length<1||params.steps.length>6)fail('INVALID_BROWSER_BATCH');
    params.steps.forEach(validateAction); // Validate the complete batch before any step executes.
  }
  return {command,params};
}
