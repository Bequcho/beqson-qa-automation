import { runCommand } from '../lib/runner.mjs';
import { safeSummary } from '../lib/report.mjs';
const report=await runCommand('AUTH_SMOKE');
console.log(JSON.stringify(safeSummary(report),null,2));
process.exitCode=report.outcome==='COMPLETED'?0:2;
