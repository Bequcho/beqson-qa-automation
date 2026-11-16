import {bootstrap,startupFailure} from './bootstrap.mjs';

try {
  const args=process.argv.slice(2);
  if(args.length>1 || args.some(arg=>!['--once','--check'].includes(arg))) throw Error('Usage: START-BRIDGE.cmd [--check | --once]');
  await bootstrap();
  if(!args.includes('--check')) await import('./watch.mjs');
}catch(error){startupFailure(error);}
