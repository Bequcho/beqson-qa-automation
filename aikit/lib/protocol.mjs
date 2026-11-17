import { ACTOR, LOCALES, CATEGORIES } from './config.mjs';
import { BROWSER_COMMANDS, validateBrowserCommand } from '../browser/protocol.mjs';
import { RETEST_COMMANDS, validateRetest } from '../retests/protocol.mjs';

export const COMMANDS=Object.freeze(['PUBLIC_REMAINING','PUBLIC_ALL','AUTH_SMOKE','SAFE_CHECKS','RUN_SCENARIO','TEST_TOOL','RUN_NEXT','RESUME_CHECKLIST','RETEST','PROGRESS','LATEST','BLOCKED','PAUSE','RESUME','STOP',...BROWSER_COMMANDS,...RETEST_COMMANDS]);
export const CONTROLS=new Set(['PROGRESS','LATEST','BLOCKED','PAUSE','RESUME','STOP']);
const exactKeys=(object,allowed)=>object && typeof object==='object' && !Array.isArray(object) && Object.keys(object).every(key=>allowed.includes(key));
export function validate(command,params={}) {
  if(BROWSER_COMMANDS.includes(command))return validateBrowserCommand(command,params);
  if(RETEST_COMMANDS.includes(command))return validateRetest(command,params);
  if (!COMMANDS.includes(command) || !exactKeys(params,['locale','scenarioId','category','bugId','reviewIssue','reviewRunId','resumeRunId'])) throw Error('INVALID_COMMAND');
  const allowed={ SAFE_CHECKS:['resumeRunId'],RUN_SCENARIO:['scenarioId','locale'],TEST_TOOL:['category','locale'],RETEST:['bugId','scenarioId'],RESUME:['reviewIssue','reviewRunId'] }[command] || [];
  if (!exactKeys(params,allowed)) throw Error('UNSUPPORTED_PARAMETER');
  if (params.locale!==undefined && !LOCALES.includes(params.locale)) throw Error('INVALID_LOCALE');
  if (['RUN_SCENARIO','RETEST'].includes(command) && !/^(?:public\.(?:home|navigation|mobile|locale)|auth\.projects|official\.[a-z-]+\.\d{2})$/.test(params.scenarioId||'')) throw Error('INVALID_SCENARIO');
  if (command==='TEST_TOOL' && !Object.hasOwn(CATEGORIES,params.category||'')) throw Error('INVALID_CATEGORY');
  if (command==='RETEST' && !/^BUG-[a-f0-9]{12}$/.test(params.bugId||'')) throw Error('INVALID_BUG');
  if (params.reviewIssue!==undefined && (!Number.isSafeInteger(params.reviewIssue) || params.reviewIssue<1)) throw Error('INVALID_REVIEW');
  if (params.reviewRunId!==undefined && !/^[a-f0-9-]{36}$/.test(params.reviewRunId)) throw Error('INVALID_REVIEW');
  if (params.resumeRunId!==undefined && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(params.resumeRunId)) throw Error('INVALID_RESUME_RUN');
  return {command,params};
}
export function parseIssue(issue) {
  const prefix=issue.title?.startsWith('AIKIT-QA: ')?'AIKIT-QA: ':issue.title?.startsWith('AIKIT-BROWSER: ')?'AIKIT-BROWSER: ':null;
  if ((issue.user?.login||issue.author?.login)!==ACTOR || issue.pull_request || !Number.isSafeInteger(issue.number) || issue.number<1 || !prefix) return null;
  const body=String(issue.body||'').replace(/\r\n/g,'\n').trim();
  if (body.length>4096) throw Error('REQUEST_TOO_LARGE');
  const command=issue.title.slice(prefix.length);
  if(prefix==='AIKIT-BROWSER: '&&!BROWSER_COMMANDS.includes(command)&&!RETEST_COMMANDS.includes(command)&&!CONTROLS.has(command))throw Error('BROWSER_LANE_COMMAND_REQUIRED');
  if(prefix==='AIKIT-QA: '&&(BROWSER_COMMANDS.includes(command)||RETEST_COMMANDS.includes(command)))throw Error('BROWSER_LANE_PREFIX_REQUIRED');
  if (body===`AIKIT_QA_BRIDGE_V1\nTASK=${command}` && ['PUBLIC_REMAINING','PUBLIC_ALL','AUTH_SMOKE'].includes(command)) return validate(command);
  if (!body.startsWith('AIKIT_QA_BRIDGE_V2\n')) throw Error('INVALID_ENVELOPE');
  let data; try { data=JSON.parse(body.slice(19)); } catch { throw Error('INVALID_JSON'); }
  if (!exactKeys(data,['version','command','params']) || data.version!==2 || data.command!==command) throw Error('INVALID_ENVELOPE');
  return validate(data.command,data.params??{});
}
