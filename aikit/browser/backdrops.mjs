// Reviewed aiKit shell only. Queue payloads cannot supply selectors or coordinates.
export const BACKDROP_SELECTOR='.sh-drawer-scrim';
export async function backdropDescriptor(handle) {
  return handle.evaluate(element=>{
    if(location.origin!=='https://aikit.ai'&&!/^http:\/\/127\.0\.0\.1:\d+$/.test(location.origin))return null;
    if(element.tagName!=='DIV'||!element.matches('.sh-drawer-scrim')||element.textContent.trim()||element.closest('form'))return null;
    const shell=element.closest('.sh.drawer-open');
    const toggles=shell?.querySelectorAll('button[aria-label="Open menu"][aria-expanded="true"]');
    const panel=shell?.querySelector('#sh-side.sh-side');
    if(toggles?.length!==1||!panel||shell.querySelectorAll('.sh-drawer-scrim').length!==1)return null;
    const r=element.getBoundingClientRect(),p=panel.getBoundingClientRect(),style=getComputedStyle(element);
    if(style.position!=='fixed'||style.display==='none'||style.visibility==='hidden'||style.pointerEvents==='none'||r.width<=0||p.width<=0)return null;
    for(const x of [innerWidth-10,10,innerWidth/2])for(const y of [innerHeight/2,innerHeight-80,80]){
      if(x<=r.left||x>=r.right||y<=r.top||y>=r.bottom||x>=p.left&&x<=p.right&&y>=p.top&&y<=p.bottom)continue;
      if(document.elementFromPoint(x,y)!==element)continue;
      return {verifiedBackdrop:'aikit-drawer',label:'Dismiss backdrop',role:'button',visible:true,enabled:true,hitTest:'clear',dismissPoint:{x:x-r.left,y:y-r.top}};
    }
    return null;
  });
}
export async function verifyDismissed(page) {
  await page.waitForFunction(()=>!document.querySelector('.sh.drawer-open')&&document.querySelector('button[aria-label="Open menu"]')?.getAttribute('aria-expanded')==='false',{},{timeout:4000});
}
