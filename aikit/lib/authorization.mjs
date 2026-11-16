import { resolve } from 'node:path';
import { atomicJson, readJson } from './storage.mjs';

// Issues cannot grant permissions. This file is written locally after explicit user approval.
export async function consumeLanguageApproval(local,locales) {
  const file=resolve(local,'authorizations.json'),data=await readJson(file,{languagePreference:null}),a=data.languagePreference;
  if(!a || a.scope!=='signed-out-language-preference-only' || a.host!=='aikit.ai' || !Number.isSafeInteger(a.remainingRuns) || a.remainingRuns<1 || !Number.isFinite(Date.parse(a.expiresAt)) || Date.parse(a.expiresAt)<=Date.now() || !Array.isArray(a.locales) || locales.some(locale=>!a.locales.includes(locale))) return false;
  a.remainingRuns--;a.lastConsumedAt=new Date().toISOString();await atomicJson(file,data);return true;
}
