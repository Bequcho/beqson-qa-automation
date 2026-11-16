import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT } from '../lib/config.mjs';
import { processCall } from '../lib/process.mjs';
import { findExecutable } from '../lib/executables.mjs';
const git=await findExecutable('git');
if(!git)throw Error('Git was not found. Set AIKIT_GIT_EXE to an existing absolute executable path.');
const listing=await processCall(git.path,['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:ROOT});
if(listing.code) throw Error('Cannot inspect public source files.');
const paths=[...new Set(listing.stdout.split('\0').filter(Boolean))];
const secret=/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-proj-[A-Za-z0-9_-]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
for(const path of paths) {
  if(/(?:^|\/)(?:\.aikit-local|aikit-qa-results|chrome-profile|qa-reports)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|auth-state\.json$|\.(?:har|zip|sqlite|db|webm)$/i.test(path)) throw Error('Sensitive or generated file would be published: '+path);
  const bytes=await readFile(resolve(ROOT,path));
  if(secret.test(bytes.toString('utf8'))) throw Error('Potential credential in public source: '+path);
}
const ignored=await processCall(git.path,['check-ignore','.aikit-local/auth-state.json','.aikit-local/chrome-profile/Default/Cookies','.aikit-local/runs/example/report.json','aikit-qa-results/report.json'],{cwd:ROOT});
if(ignored.code!==0 || ignored.stdout.trim().split(/\r?\n/).length!==4) throw Error('Private evidence ignore rules are incomplete.');
console.log(`Checked ${paths.length} publishable source files; private evidence ignored; no supported token or key patterns found.`);
