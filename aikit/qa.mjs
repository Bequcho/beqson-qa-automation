import { runCommand } from './lib/runner.mjs';
import { safeSummary } from './lib/report.mjs';

const args=process.argv.slice(2);
if(args.some(a=>a!=='--all') || args.length>1) throw Error('Usage: node aikit/qa.mjs [--all]');
const report=await runCommand(args.includes('--all')?'PUBLIC_ALL':'PUBLIC_REMAINING');
console.log(JSON.stringify(safeSummary(report),null,2));
process.exitCode=report.outcome==='COMPLETED'?0:report.outcome==='REVIEW_REQUIRED'?1:2;
