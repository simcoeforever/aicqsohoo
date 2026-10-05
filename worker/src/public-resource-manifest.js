// Public site metadata only. No requested record ID/language/query enters the ledger.
const target='https://aicqsohoo.com/measurement-manifest.json';
const kinds='experience|agent|weekly_report|experiment_article|payment_policy';
const recordPath=new RegExp('^/records/('+kinds+')/[a-z0-9-]{1,100}\\.(en|ja)\\.json$');
const fixed=new Map([['/index.json','/index.json'],['/machine-schema.json','/machine-schema.json'],
 ['/payment-policy/','/payment-policy/'],['/ja/payment-policy/','/payment-policy/']]);
export function validateManifest(body){
 if(!body||Object.keys(body).sort().join(',')!=='resources,schema_version'||body.schema_version!==1||!Array.isArray(body.resources)||body.resources.length>1000)return null;
 const result=new Map();
 for(const item of body.resources){
  if(!item||Object.keys(item).sort().join(',')!=='group,path'||typeof item.path!=='string'||typeof item.group!=='string'||result.has(item.path))return null;
  const match=item.path.match(recordPath),expected=fixed.get(item.path)||(match?'/records/'+match[1]+'/':null);
  if(!expected||item.group!==expected)return null;
  result.set(item.path,item.group);
 }
 if([...fixed].some(([path])=>!result.has(path)))return null;
 return result;
}
export function createManifestResolver({now=Date.now,ttlMs=300000}={}){
 let expires=0,promise;
 return async function resolve(path,forward=fetch){
  if(!fixed.has(path)&&!recordPath.test(path))return null;
  if(!promise||now()>=expires){
   expires=now()+ttlMs;
   promise=(async()=>{try{
    // Use the same origin-forwarding fetch as proxySite: bypass the Worker route,
    // with no visitor headers, referrer, credentials, redirects or query.
    const response=await forward(new Request(target,{headers:{Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(8000)}));
    if(response.status!==200||!response.headers.get('Content-Type')?.includes('application/json'))return null;
    const reader=response.body?.getReader();if(!reader)return null;const chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();return null;}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return validateManifest(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
   }catch(_){return null;}})();
  }
  return (await promise)?.get(path)||null;
 };
}
export const resolvePublicResource=createManifestResolver();
