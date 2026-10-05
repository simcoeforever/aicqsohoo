// User-run only. Key values arrive in process memory, never CLI args/files/logs.
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {fileURLToPath} from 'node:url';
import {createSupportedBridge} from './cdp-supported-bridge.mjs';
let mf;
try {
  const bundled=await build({entryPoints:[fileURLToPath(new URL('./auth-check-worker.js',import.meta.url))],
    bundle:true,write:false,format:'esm',platform:'browser',conditions:['workerd','worker','browser'],
    external:['node:*'],logLevel:'silent'});
  mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'local-auth',modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-09-01',
    compatibilityFlags:['nodejs_compat'],bindings:{CDP_API_KEY_ID:process.env.CDP_API_KEY_ID,
      CDP_API_KEY_SECRET:process.env.CDP_API_KEY_SECRET},
    outboundService:createSupportedBridge() }]}));
  delete process.env.CDP_API_KEY_ID;delete process.env.CDP_API_KEY_SECRET;
  const localResponse=await mf.dispatchFetch('https://local.invalid/check');
  if(localResponse.status!==200)throw Error('Local harness response failed');
  const result=await localResponse.json();
  console.log(JSON.stringify(result));
  if(!result.authenticated||!result.base_exact_v2)process.exitCode=1;
}catch(_){console.error('Authentication check failed; no payment performed. Credentials and exception details were suppressed.');process.exitCode=1;}
finally{delete process.env.CDP_API_KEY_ID;delete process.env.CDP_API_KEY_SECRET;if(mf)await mf.dispose();}
