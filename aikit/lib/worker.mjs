import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { LOCAL } from './config.mjs';
import { atomicJson, readJson } from './storage.mjs';
import { parseIssue, CONTROLS } from './protocol.mjs';
import { safeSummary } from './report.mjs';
import { runCommand } from './runner.mjs';

export class Worker {
  constructor(github,{local=LOCAL,execute=runCommand,signal,controlPollMs=5000,lane='all'}={}) {this.github=github;this.local=local;this.file=resolve(local,'bridge-state.json');this.execute=execute;this.signal=signal;this.stop=false;this.controlPollMs=controlPollMs;this.lane=lane;}
  inLane(issue){return this.lane==='all'||issue.title?.startsWith(this.lane==='browser'?'AIKIT-BROWSER: ':'AIKIT-QA: ');}
  async load() {
    this.state=await readJson(this.file,{version:2,paused:false,holdIssue:null,issues:{}});
    if(this.state.version!==2) throw Error('LEGACY_STATE_REQUIRES_MIGRATION');
    for(const [id,entry] of Object.entries(this.state.issues)) {
      if(entry.stage!=='running') continue;
      const report=await readJson(resolve(this.local,'runs',entry.runId,'report.json'),null);
      entry.summary=report?safeSummary(report):{version:2,runId:entry.runId,command:entry.command,outcome:'INTERRUPTED',counts:{PASS:0,FAIL:0,BLOCKED:1,'NOT TESTED':0},officialItemsAutoCompleted:0};
      entry.stage='report_ready';
      if(['REVIEW_REQUIRED','INTERRUPTED'].includes(entry.summary.outcome)) {this.state.paused=true;this.state.holdIssue=Number(id);}
    }
    await this.save();
  }
  save() {return atomicJson(this.file,this.state);}
  async publish(id,entry) {
    const marker=`<!-- aikit-result:${id}:${entry.runId} -->`;
    if(entry.stage==='report_ready') {
      const comments=await this.github.comments(id);
      if(!comments.some(c=>c.user?.login==='Bequcho' && c.body?.includes(marker))) await this.github.comment(id,marker+'\n[aiKit QA Bridge result]\n```json\n'+JSON.stringify(entry.summary,null,entry.summary.browser?0:2)+'\n```\nDetailed evidence remains local. Official item statuses are unchanged.');
      entry.stage='reported';await this.save();
    }
    if(entry.stage==='reported') {await this.github.close(id,entry.summary.outcome==='REJECTED');entry.stage='done';await this.save();}
  }
  async tick() {
    await this.github.verify?.();
    // Recover publication even when an issue is already closed or absent from the first queue page.
    for(const [id,entry] of Object.entries(this.state.issues)) if(['report_ready','reported'].includes(entry.stage)) await this.publish(Number(id),entry);
    if(this.signal?.aborted || this.stop) return;
    const issues=await this.github.issues(),accepted=[];
    for(const issue of issues) {
      if(!this.inLane(issue))continue;
      if(this.state.issues[issue.number]) continue;
      try {const request=parseIssue(issue);if(request) accepted.push({issue,request});}
      catch {if(issue.user?.login==='Bequcho' && !issue.pull_request && (issue.title?.startsWith('AIKIT-QA: ')||issue.title?.startsWith('AIKIT-BROWSER: '))) accepted.push({issue,request:null});}
    }
    // Control requests remain usable while the test queue is paused.
    accepted.sort((a,b)=>Number(CONTROLS.has(b.request?.command))-Number(CONTROLS.has(a.request?.command)) || a.issue.number-b.issue.number);
    for(const {issue,request} of accepted) {
      if(this.signal?.aborted || this.stop) break;
      if(this.state.paused && request && !CONTROLS.has(request.command)) continue;
      const id=issue.number,comments=await this.github.comments(id);
      // A remote receipt protects against accidental replay after loss of the local checkpoint.
      if(comments.some(c=>c.user?.login==='Bequcho' && /<!-- aikit-(?:claim|result):/.test(c.body||''))) {
        const result=comments.find(c=>c.user?.login==='Bequcho' && c.body?.includes(`<!-- aikit-result:${id}:`));
        if(result) await this.github.close(id);
        this.state.issues[id]={stage:'done',recoveredRemoteReceipt:true};await this.save();continue;
      }
      const entry={runId:randomUUID(),command:request?.command||'REJECTED',stage:'running',startedAt:new Date().toISOString()};
      this.state.issues[id]=entry;await this.save();
      // No browser execution begins until a durable local checkpoint AND remote receipt exist.
      await this.github.comment(id,`<!-- aikit-claim:${id}:${entry.runId} -->\nLocal QA Bridge accepted this task. A restart will recover its result or mark it interrupted; it will not rerun it.`);
      let report;
      if(!request) report={runId:entry.runId,command:'REJECTED',outcome:'REJECTED',checks:[]};
      else if(['PAUSE','RESUME','STOP'].includes(request.command)) {
        if(request.command==='RESUME' && ((this.state.holdIssue && request.params.reviewIssue!==this.state.holdIssue)||(this.state.holdRunId && request.params.reviewRunId!==this.state.holdRunId))) report={runId:entry.runId,command:'RESUME',outcome:'BLOCKED',checks:[{status:'BLOCKED'}]};
        else {this.state.paused=request.command!=='RESUME';if(request.command==='RESUME'){this.state.holdIssue=null;this.state.holdRunId=null;delete this.state.holdReason;}if(request.command==='STOP')this.stop=true;report={runId:entry.runId,command:request.command,outcome:'COMPLETED',checks:[]};}
      } else {
        const interrupt=new AbortController(),signal=this.signal?AbortSignal.any([this.signal,interrupt.signal]):interrupt.signal;
        let polling=false;
        const monitor=setInterval(async()=>{
          if(polling)return;polling=true;
          try {
            const pending=await this.github.issues();
            for(const candidate of pending) {
              if(!this.inLane(candidate))continue;
              if(this.state.issues[candidate.number])continue;
              let control;try{control=parseIssue(candidate);}catch{continue;}
              if(control && ['PAUSE','STOP'].includes(control.command)) {interrupt.abort();break;}
            }
          }catch{}finally{polling=false;}
        },this.controlPollMs);
        try {report=await this.execute(request.command,request.params,{local:this.local,runId:entry.runId,signal});}
        finally {clearInterval(monitor);}
        if(interrupt.signal.aborted) this.state.paused=true;
      }
      entry.summary=safeSummary(report);entry.stage='report_ready';entry.finishedAt=new Date().toISOString();
      if(report.outcome==='REVIEW_REQUIRED' || this.signal?.aborted) {this.state.paused=true;this.state.holdIssue=id;}
      await this.save();await this.publish(id,entry);
    }
  }
}
