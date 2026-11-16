import { readFile } from 'node:fs/promises';
import { recordReview } from '../lib/review.mjs';
if(process.argv.length!==3) throw Error('Usage: node aikit/bridge/record-result.mjs LOCAL_REVIEW_JSON');
console.log(JSON.stringify(await recordReview(JSON.parse(await readFile(process.argv[2],'utf8')))));
