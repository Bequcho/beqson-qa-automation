export type RetestDisposition='PASS'|'FAIL'|'BLOCKED'|'REVIEW_REQUIRED'|'NOT TESTED';
export type RetestCommand='DISCOVER_RETESTS'|'RETEST_REPORT'|'RETEST_ALL_LIVE'|'RETEST_RESUME'|'RETEST_STATUS';
export interface BugReport {id:string;number:number;url:string;owned:true;status:'LIVE'|'FIXED'|'OPEN'|'CLOSED'|'UNKNOWN';title:string;description:string;steps:string;expected:string;previousActual:string;developerFix:string;severity:string;area:string;history:string;revision:string}
export interface BugAssertion {id:string;passed:boolean|null;expected:unknown;actual:unknown}
export interface RetestResult {status:RetestDisposition;reason:string;executed:boolean;technicalSuccess?:boolean;bugFixVerified:boolean;assertions:BugAssertion[];actions:unknown[];at?:string}
export interface RetestSpec {version:string;reportId:string;reportNumber:number;sourceRevision:string;objective:string;preconditions:string[];exactActions:string[];expectedAssertions:string[];mutation:string;tokenCost:string;cleanup:string;blocker?:string}
