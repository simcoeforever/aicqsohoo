// Node-side bridge for Miniflare's non-native Request. Never log errors/headers.
const URL='https://api.cdp.coinbase.com/platform/v2/x402/supported';
export function createSupportedBridge(fetcher=fetch){return async request=>{
  if(request.method!=='GET'||request.url!==URL)return new Response(null,{status:503,
    headers:{'X-AICQ-Diagnostic-Source':'local_policy'}});
  try {
    // Miniflare Request is NOT a Node/Undici Request. Passing it directly to
    // Node fetch tries to parse "[object Request]" as a URL and throws.
    const response=await fetcher(request.url,{method:'GET',headers:new Headers(request.headers),
      redirect:'manual',signal:AbortSignal.timeout(20000)});
    const headers=new Headers(response.headers);
    // Overwrite any remote copies: these markers are only local provenance.
    headers.set('X-AICQ-Diagnostic-Source','remote_http');
    headers.set('X-AICQ-Remote-Status',String(response.status));
    return new Response(response.body,{status:response.status,headers});
  }catch(_){return new Response(null,{status:502,
    headers:{'X-AICQ-Diagnostic-Source':'local_transport'}});}
};}
