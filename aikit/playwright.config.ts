import { defineConfig } from '@playwright/test';
import path from 'node:path';

const local=path.resolve(process.env.AIKIT_LOCAL_DIR || '.aikit-local');
const run=process.env.AIKIT_RUN_DIR || path.join(local,'standalone');
export default defineConfig({
  testDir:'./tests',outputDir:path.join(run,'artifacts'),
  timeout:45_000,expect:{timeout:12_000},workers:1,fullyParallel:false,retries:0,maxFailures:1,
  forbidOnly:!!process.env.CI,reporter:[['json',{outputFile:path.join(run,'playwright.json')}]],
  use:{browserName:'chromium',headless:true,viewport:{width:1440,height:900},actionTimeout:12_000,navigationTimeout:30_000,trace:'on',screenshot:'on',video:'off',acceptDownloads:false,serviceWorkers:'block'},
  projects:[{name:'aikit-chromium'}],
});
