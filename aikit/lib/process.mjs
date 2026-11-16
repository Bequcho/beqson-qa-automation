import { spawn } from 'node:child_process';

export async function processCall(command, args, { cwd, timeout=60_000, signal, input, env=process.env, inherit=false }={}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell:false, windowsHide:true, env, stdio:inherit?'inherit':['pipe','pipe','pipe'] });
    let stdout='', stderr='', timedOut=false, stopping;
    const tail = (old, data) => (old+data.toString()).slice(-131072);
    child.stdout?.on('data', data => { stdout=tail(stdout,data); });
    child.stderr?.on('data', data => { stderr=tail(stderr,data); });
    child.stdin?.on('error', ()=>{});
    if (!inherit) child.stdin.end(input);
    const stop = () => {
      if (stopping) return; stopping=true;
      if (process.platform === 'win32') {
        // Killing only node leaves Chromium descendants alive on Windows.
        const killer=spawn('taskkill.exe', ['/pid',String(child.pid),'/T','/F'], {windowsHide:true,stdio:'ignore',shell:false});
        killer.on('error', ()=>child.kill());
        killer.on('close', code=>{if(code!==0)child.kill();});
      } else { child.kill('SIGTERM'); setTimeout(()=>child.kill('SIGKILL'),2000).unref(); }
    };
    const timer = setTimeout(()=>{ timedOut=true; stop(); },timeout);
    signal?.addEventListener('abort',stop,{once:true});
    if (signal?.aborted) stop();
    const cleanup=()=>{clearTimeout(timer); signal?.removeEventListener('abort',stop);};
    child.on('error', error=>{cleanup(); reject(error);});
    child.on('close', code=>{cleanup(); resolve({code:timedOut?124:stopping?130:(code??1),stdout,stderr});});
  });
}
