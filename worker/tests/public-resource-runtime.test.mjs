import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
test('exact upload bundle records all manifest paths by group without IDs/query/language; no payment calls or legacy changes',{skip:process.env.AICQ_AUDIT_DEPLOYED_BUNDLE!=='1'},async()=>{
 const manifest=JSON.parse(readFileSync(new URL('../../site/measurement-manifest.json',import.meta.url)));let manifestCalls=0;const paths=[];
 const mf=new Miniflare(convertV4MiniflareOptions({unsafeInspectDurableObjects:true,workers:[{name:'catalog-resource-runtime',modules:true,script:readFileSync(process.env.AICQ_AUDIT_BUNDLE_PATH||new URL('../.wrangler/dryrun/index.js',import.meta.url),'utf8'),compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],durableObjects:{COUNTER:{className:'Counter',useSQLite:true},PAYMENTS:{className:'Payments',useSQLite:true},MAINNET_PAYMENTS:{className:'MainnetPayments',useSQLite:true}},bindings:{EDGE_ENABLED:'true',METRICS_ENABLED:'true',PUBLIC_PAGES:'["/","/about/","/experiment/"]'},outboundService:request=>{
  paths.push({path:new URL(request.url).pathname,method:request.method,cookie_present:request.headers.has('Cookie')});assert.equal(new URL(request.url).origin,'https://aicqsohoo.com');assert.equal(request.method,'GET');assert.equal(request.url.includes('/contribution/'),false);
  if(new URL(request.url).pathname==='/measurement-manifest.json'){manifestCalls++;assert.equal(request.url,'https://aicqsohoo.com/measurement-manifest.json');assert.equal(request.headers.has('Cookie'),false);return Response.json(manifest);}
  return new Response('original origin body',{status:new URL(request.url).pathname==='/records/missing.en.json'?404:200});
 }}]}));
 try{
  for(const item of manifest.resources){const r=await mf.dispatchFetch('https://aicqsohoo.com'+item.path+'?measurement=test&SECRET=query',{headers:{Referer:'https://search.example/PRIVATE?SECRET=1',Cookie:'SECRET', 'User-Agent':'SECRET'}});assert.equal(r.status,200);assert.equal(await r.text(),'original origin body');assert.equal(r.headers.get('X-AICQSOHOO-Test-Measurement'),'recorded',item.path+' '+JSON.stringify(paths));}
  assert.equal(manifestCalls,1);
  for(const path of ['/','/ja/about/','/experiences.json','/llms.txt'])assert.equal((await mf.dispatchFetch('https://aicqsohoo.com'+path+'?measurement=test')).headers.get('X-AICQSOHOO-Test-Measurement'),'recorded');
  assert.equal((await mf.dispatchFetch('https://aicqsohoo.com/records/weekly_report/unknown.en.json?measurement=test')).headers.get('X-AICQSOHOO-Test-Measurement'),'not-recorded');
  const storage=await mf.unsafeGetDurableObjectStorage('catalog-resource-runtime','Counter',{name:'site'}),rows=await storage.exec('SELECT * FROM metrics');assert.equal(rows.reduce((n,r)=>n+r.n,0),manifest.resources.length+4);
  const groups=new Set(manifest.resources.map(x=>x.group));assert.ok(rows.every(r=>r.test===1&&r.event==='resource_get'&&(groups.has(r.page)||['/','/about/','/experiences.json','/llms.txt'].includes(r.page))));assert.ok(rows.every(r=>['search.example','unknown'].includes(r.source)));assert.equal(JSON.stringify(rows).includes('SECRET'),false);
  assert.equal((await(await mf.dispatchFetch('https://counter/hit')).json()).count,0);
 }finally{await mf.dispose();}
});
