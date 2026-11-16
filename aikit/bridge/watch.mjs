import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { GitHub } from '../lib/github.mjs';
import { LOCAL, QUEUE } from '../lib/config.mjs';
import { lock, atomicJson, readJson } from '../lib/storage.mjs';
import { Worker } from '../lib/worker.mjs';

if(process.argv.slice(2).some(arg=>arg!=='--once')) throw Error('Usage: node aikit/bridge/watch.mjs [--once]');
const release=await lock(resolve(LOCAL,'bridge.lock'));
const controller=new AbortController();
const stop=()=>controller.abort();
process.on('SIGINT',stop);process.on('SIGTERM',stop);
try {
  // Migrate historical v1 receipts without ever replaying their tasks.
  const old=await readJson(resolve(LOCAL,'bridge-state.json'),null);
  if(old?.version===1) {
    await atomicJson(resolve(LOCAL,'bridge-state.v1.backup.json'),old);
    const issues=Object.fromEntries(Object.entries(old.issues).map(([id,value])=>[id,{...value,stage:'done',legacyRequiresReview:value.stage!=='done'}]));
    await atomicJson(resolve(LOCAL,'bridge-state.json'),{version:2,paused:true,holdIssue:null,issues});
  }
  const github=await GitHub.connect(),worker=new Worker(github,{signal:controller.signal});
  console.log(`aiKit Bridge ready: ${QUEUE}. Single local worker; Ctrl+C stops the active browser tree.`);
  let failures=0;
  do {
    try {
      await worker.load();await worker.tick();failures=0;
      await atomicJson(resolve(LOCAL,'heartbeat.json'),{at:new Date().toISOString(),pid:process.pid,paused:worker.state.paused,holdIssue:worker.state.holdIssue});
    } catch {failures++;console.error('Bridge cycle blocked. Check local authentication/network and restart if needed. No browser replay.');}
    if(process.argv.includes('--once') || worker.stop || controller.signal.aborted) {if(failures)process.exitCode=2;break;}
    await delay(Math.min(300_000,30_000*2**Math.min(failures,3)),undefined,{signal:controller.signal}).catch(()=>{});
  } while(!controller.signal.aborted);
} finally {process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);await release();}
