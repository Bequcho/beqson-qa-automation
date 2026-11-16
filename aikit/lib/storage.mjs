import { mkdir, readFile, open, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return structuredClone(fallback); throw error; }
}
export async function atomicJson(file, value) {
  await mkdir(dirname(file), { recursive:true, mode:0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  try { await rename(temp, file); } catch (error) { await unlink(temp).catch(()=>{}); throw error; }
}
export async function lock(file) {
  await mkdir(dirname(file), { recursive:true, mode:0o700 });
  for (let attempt=0; attempt<2; attempt++) {
    try {
      const handle = await open(file, 'wx', 0o600);
      const token = randomUUID();
      await handle.writeFile(JSON.stringify({ pid:process.pid, token })); await handle.sync(); await handle.close();
      return async () => { const value = await readJson(file, {}); if (value.token === token) await unlink(file); };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let owner;
      try { owner = await readJson(file); }
      catch { throw Error('LOCK_UNREADABLE: inspect local lock; refusing unsafe takeover'); }
      if (!Number.isSafeInteger(owner.pid) || owner.pid < 1) throw Error('LOCK_INVALID');
      try { process.kill(owner.pid, 0); throw Error('LOCK_ACTIVE'); }
      catch (probe) { if (probe.code !== 'ESRCH') throw probe; }
      // Serialize stale-lock recovery, so two startups cannot unlink a newly acquired lock.
      const guard=await open(file+'.reclaim','wx',0o600);
      try {
        const again=await readJson(file);
        if(again.token!==owner.token) throw Error('LOCK_CHANGED');
        try {process.kill(again.pid,0);throw Error('LOCK_ACTIVE');}
        catch(probe) {if(probe.code!=='ESRCH') throw probe;}
        await unlink(file);
      } finally {await guard.close();await unlink(file+'.reclaim');}
    }
  }
  throw Error('LOCK_UNAVAILABLE');
}
