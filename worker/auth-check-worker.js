// Local workerd harness only; excluded from the production Worker entrypoint.
import {checkCdpAuthentication} from './src/cdp-auth.js';
export default {async fetch(request,env){
  if(request.method!=='GET'||new URL(request.url).pathname!=='/check')return new Response(null,{status:404});
  return Response.json(await checkCdpAuthentication({apiKeyId:env.CDP_API_KEY_ID,apiKeySecret:env.CDP_API_KEY_SECRET}));
}};
