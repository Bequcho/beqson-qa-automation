import { readdir, lstat, statfs } from 'node:fs/promises';
import { resolve } from 'node:path';
export async function checkBudget(local) {
  const disk=await statfs(local);
  if(disk.bavail*disk.bsize<1024**3) throw Error('LOCAL_DISK_BELOW_1_GIB');
  let total=0,files=0;
  async function visit(dir) {
    for(const entry of await readdir(dir,{withFileTypes:true})) {
      const path=resolve(dir,entry.name),info=await lstat(path);
      if(info.isSymbolicLink()) throw Error('LOCAL_EVIDENCE_SYMLINK_REJECTED');
      if(info.isDirectory()) await visit(path); else {total+=info.size;files++;}
      if(total>2*1024**3 || files>100_000) throw Error('LOCAL_EVIDENCE_BUDGET_REACHED_ARCHIVE_MANUALLY');
    }
  }
  await visit(resolve(local,'runs')).catch(error=>{if(error.code!=='ENOENT')throw error;});
}
