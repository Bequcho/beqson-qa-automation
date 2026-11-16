import { processCall } from './process.mjs';
import { QUEUE, ACTOR, ROOT } from './config.mjs';

async function credential() {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  try {
    const result=await processCall(process.platform==='win32'?'gh.exe':'gh',['auth','token'],{cwd:ROOT});
    if (result.code===0 && result.stdout.trim()) return result.stdout.trim();
  } catch {}
  const result=await processCall('git',['credential','fill'],{cwd:ROOT,input:'protocol=https\nhost=github.com\n\n',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}});
  const password=result.stdout.split(/\r?\n/).find(line=>line.startsWith('password='))?.slice(9);
  if (result.code || !password) throw Error('GITHUB_AUTH_REQUIRED: run GitHub CLI login or configure Git Credential Manager');
  return password;
}
export class GitHub {
  constructor(token) { this.token=token; }
  static async connect() { const client=new GitHub(await credential()); await client.verify(); return client; }
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
