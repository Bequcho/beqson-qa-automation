import { processCall } from './process.mjs';
import { QUEUE, ACTOR, ROOT } from './config.mjs';
import { findExecutable, gitEnvironment } from './executables.mjs';

export async function credential({env=process.env,find=findExecutable,run=processCall}={}) {
  if (env.GH_TOKEN || env.GITHUB_TOKEN) return {token:env.GH_TOKEN||env.GITHUB_TOKEN,source:env.GH_TOKEN?'GH_TOKEN environment':'GITHUB_TOKEN environment'};
  const gh=await find('gh',{env});
  if(gh) {
    try {
      const result=await run(gh.path,['auth','token'],{cwd:ROOT,env});
      if(result.code===0&&result.stdout.trim())return {token:result.stdout.trim(),source:'GitHub CLI',executable:gh.path};
    }catch{} // Never expose auth stdout/stderr; a configured Git helper may still work.
  }
  const git=await find('git',{env});
  if(!git&&gh)throw Error('GITHUB_AUTH_REQUIRED: GitHub CLI was detected but returned no credential. Sign in locally with gh auth login, then restart; Git installation is not required for this authentication method.');
  if(!git)throw Error('GITHUB_TOOLS_MISSING: no working Git or authenticated GitHub CLI was found on PATH or in installed application directories. Set AIKIT_GIT_EXE to an existing absolute git.exe path, or install Git for Windows if neither application is installed.');
  let result;
  try {result=await run(git.path,['credential','fill'],{cwd:ROOT,input:'protocol=https\nhost=github.com\n\n',env:{...gitEnvironment(git,env),GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}});}
  catch {throw Error('GITHUB_TOOL_START_FAILED: the detected Git could not start. Restart the bridge to rediscover an updated installation.');}
  const password=result.stdout.split(/\r?\n/).find(line=>line.startsWith('password='))?.slice(9);
  if (result.code || !password) throw Error('GITHUB_AUTH_REQUIRED: Git was detected, but its configured credential helper returned no GitHub credential. Sign in locally with Git Credential Manager or GitHub CLI, then restart. Do not paste credentials into chat or source files.');
  return {token:password,source:'Git credential helper',executable:git.path,installation:git.source};
}
export class GitHub {
  constructor(token) { this.token=token; }
  static async connect(options) { const auth=await credential(options);const client=new GitHub(auth.token);client.authentication={source:auth.source,executable:auth.executable,installation:auth.installation};await client.verify();return client; }
  async request(path, method='GET', body) {
    if (!/^\/(?:user$|repos\/Bequcho\/beqson-qa-platform(?:\/|$))/.test(path)) throw Error('GITHUB_PATH_REJECTED');
    const response=await fetch('https://api.github.com'+path, {
      method, redirect:'error', signal:AbortSignal.timeout(30_000),
      headers:{Authorization:`Bearer ${this.token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','Content-Type':'application/json','User-Agent':'aikit-local-qa'},
      body:body===undefined?undefined:JSON.stringify(body)
    });
    if (!response.ok) throw Error(`GITHUB_HTTP_${response.status}`); // Never log response bodies or credentials.
    return response.status===204?null:response.json();
  }
  async verify() {
    const [user,repo]=await Promise.all([this.request('/user'),this.request('/repos/'+QUEUE)]);
    if (user.login!==ACTOR || repo.private!==true || !repo.permissions?.push) throw Error('GITHUB_PRIVATE_OWNER_CHECK_FAILED');
  }
  async pages(path) {
    const results=[];
    for (let page=1; page<=100; page++) {
      const rows=await this.request(path+(path.includes('?')?'&':'?')+`per_page=100&page=${page}`);
      results.push(...rows); if (rows.length<100) return results;
    }
    throw Error('GITHUB_PAGINATION_LIMIT');
  }
  issues() { return this.pages(`/repos/${QUEUE}/issues?state=open&sort=created&direction=asc`); }
  comments(number) { return this.pages(`/repos/${QUEUE}/issues/${number}/comments`); }
  comment(number,body) { return this.request(`/repos/${QUEUE}/issues/${number}/comments`,'POST',{body}); }
  close(number,rejected=false) { return this.request(`/repos/${QUEUE}/issues/${number}`,'PATCH',{state:'closed',state_reason:rejected?'not_planned':'completed'}); }
}
