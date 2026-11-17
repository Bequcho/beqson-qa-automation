export const RETEST_COMMANDS=Object.freeze(['DISCOVER_RETESTS','RETEST_REPORT','RETEST_ALL_LIVE','RETEST_RESUME','RETEST_STATUS']);
export function validateRetest(command,params){
 const keys={DISCOVER_RETESTS:[],RETEST_REPORT:['reportNumber'],RETEST_ALL_LIVE:['maxReports'],RETEST_RESUME:['batchId','maxReports','retryBlocked'],RETEST_STATUS:['batchId']}[command];
 if(!keys||!params||typeof params!=='object'||Array.isArray(params)||Object.keys(params).some(k=>!keys.includes(k)))throw Error('INVALID_RETEST_PARAMETERS');
 if(command==='RETEST_REPORT'&&(!Number.isSafeInteger(params.reportNumber)||params.reportNumber<1||params.reportNumber>1000000))throw Error('INVALID_REPORT_NUMBER');
 if(params.batchId!==undefined&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(params.batchId))throw Error('INVALID_RETEST_BATCH');
 if(params.maxReports!==undefined&&(!Number.isInteger(params.maxReports)||params.maxReports<1||params.maxReports>30))throw Error('INVALID_RETEST_LIMIT');
 if(params.retryBlocked!==undefined&&typeof params.retryBlocked!=='boolean')throw Error('INVALID_RETEST_RETRY');
 return {command,params};
}
