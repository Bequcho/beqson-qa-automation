import {BrowserController} from './controller.mjs';
const controllers=new Map();
export function interactiveController(local) {
  if(!controllers.has(local))controllers.set(local,new BrowserController({local}));
  return controllers.get(local);
}
export async function closeInteractiveControllers(){for(const controller of controllers.values())await controller.close();controllers.clear();}
