export const PROGRAM='/tools/hub/program/037aa847-61e9-4cc2-8679-b13b8c0022ae';
export const UUID='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
export function reportIdentity(url,origin){try{const u=new URL(url,origin),m=u.pathname.match(new RegExp('^/home/problems/('+UUID+')$'));return u.origin===origin&&!u.search&&!u.hash&&m?m[1]:null}catch{return null}}
// Only GETs already observed in the ordinary authorized report UI. No direct
// API client, endpoint discovery, response parsing, writes or token routes.
export function reportUiRequestAllowed(request,origin,ids,enabled){
 if(!enabled||request.method()!=='GET')return false;
 const u=new URL(request.url());if(u.origin!==origin||u.search||u.hash)return false;
 if(u.pathname==='/api/tools/hub/programs/'+PROGRAM.split('/').at(-1))return true;
 const m=u.pathname.match(new RegExp('^/api/problem-reports/('+UUID+')(?:/after)?$'));return !!m&&ids.has(m[1]);
}
export const PUBLIC_RETEST_ROUTES=new Set(['/websites','/help/graphics-library','/ru/tools/graphics-library','/ru/help/graphics-library']);
