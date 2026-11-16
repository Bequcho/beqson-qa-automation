import { LOCALES } from './config.mjs';

const SAFE_SCENARIOS=new Set(['public.home','public.navigation','public.mobile']);
export function remainingSafeChecks(report) {
  if(report?.command!=='SAFE_CHECKS' || !Array.isArray(report.checks)) throw Error('SAFE_CHECKPOINT_REQUIRED');
  const seen=new Set();
  return report.checks.filter(check=>{
    if(check.status!=='NOT TESTED') return false;
    if(!SAFE_SCENARIOS.has(check.scenarioId) || !LOCALES.includes(check.locale)) throw Error('INVALID_CHECKPOINT_CASE');
    const key=check.scenarioId+'|'+check.locale;
    if(seen.has(key)) return false;
    seen.add(key);return true;
  }).map(({scenarioId,locale})=>({scenarioId,locale}));
}
export function casePattern(checks) {
  const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return '(?:'+checks.map(c=>escape(`${c.scenarioId} [${c.locale}]`)).join('|')+')$';
}
