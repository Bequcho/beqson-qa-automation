import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const LOCAL = resolve(process.env.AIKIT_LOCAL_DIR || resolve(ROOT, '.aikit-local'));
if(LOCAL===ROOT || dirname(LOCAL)===LOCAL || !LOCAL.toLowerCase().endsWith('.aikit-local')) throw Error('AIKIT_LOCAL_DIR must name a dedicated .aikit-local directory, not a drive or workspace root.');
export const QUEUE = 'Bequcho/beqson-qa-platform';
export const ACTOR = 'Bequcho';
export const BASE = 'https://aikit.ai';
export const PROGRAM = '/tools/hub/program/037aa847-61e9-4cc2-8679-b13b8c0022ae?tab=space';
export const LOCALES = Object.freeze(['en','es','pt-BR','fr','de','it','nl','pl','cs','hr','da','sv','el','ru','tr','he','ar','hi','bn','pa-Arab','id','vi','th','ht','zh-Hans','zh-Hant','ja','ko']);
export const CATEGORIES = Object.freeze({ 'Your websites':8, 'Site Plan':10, 'Bring in a site':8, 'Voice Kit':11, 'Audio Kit':27, 'Website modules':5, 'Live Chat':14, 'Pro Designer Automate':11, Languages:5 });
export const STATUSES = Object.freeze(['PASS','FAIL','BLOCKED','NOT TESTED']);
