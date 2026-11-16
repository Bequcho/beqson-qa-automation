import { runCommand } from '../lib/runner.mjs';
import { safeSummary } from '../lib/report.mjs';
const [command,...rest]=process.argv.slice(2);
if(rest.length>1) throw Error('Usage: command.mjs COMMAND [JSON_PARAMS]');
const report=await runCommand(command,rest.length?JSON.parse(rest[0]):{});
console.log(JSON.stringify(safeSummary(report),null,2));
process.exitCode=report.outcome==='COMPLETED'?0:2;
