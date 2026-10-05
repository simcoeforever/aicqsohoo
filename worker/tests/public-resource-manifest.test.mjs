import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createManifestResolver,validateManifest} from '../src/public-resource-manifest.js';import {proxySite} from '../src/gateway.js';import {disclose} from '../src/metrics.js';
const manifest=JSON.parse(readFileSync(new URL('../../site/measurement-manifest.json',import.meta.url)));
const manifestReply=()=>Response.json(manifest);
test('exact common public manifest includes all catalog JSONs and both policy HTMLs; no extra paths',()=>{
 const index=JSON.parse(readFileSync(new URL('../../site/index.json',import.meta.url)));const expected=['/index.json','/machine-schema.json','/payment-policy/','/ja/payment-policy/',...index.records.map(r=>new URL(r.json_url).pathname)].sort();
 assert.deepEqual([...validateManifest(manifest).keys()].sort(),expected);
 for(const mutation of [{schema_version:2}, {private:'SECRET'}, {resources:[...manifest.resources,{path:'/records/experience/private.en.json?SECRET',group:'/records/experience/'}]}, {resources:[...manifest.resources,{path:'/contribution/mainnet/info',group:'/records/payment_policy/'}]}, {resources:[...manifest.resources,{path:'/records/experience/unknown.en.json',group:'/private/'}]}])assert.equal(validateManifest({...manifest,...mutation}),null);
});
test('bounded manifest fetch strips all visitor headers/query, caches concurrent requests, refreshes for future weekly publication without Worker deployment',async()=>{
 let clock=0,calls=0,body=manifest;const resolve=createManifestResolver({now:()=>clock,ttlMs:300000});const fetcher=async r=>{calls++;assert.equal(r.url,'https://aicqsohoo.com/measurement-manifest.json');assert.equal(r.method,'GET');assert.equal(r.redirect,'manual');assert.equal(r.headers.has('Cookie'),false);assert.equal(r.headers.has('Referer'),false);assert.equal(r.headers.has('Authorization'),false);return Response.json(body);};
 assert.deepEqual(await Promise.all(Array.from({length:10},()=>resolve('/index.json',fetcher))),Array(10).fill('/index.json'));assert.equal(calls,1);
 const future='/records/weekly_report/2026-10-05.ja.json';assert.equal(await resolve(future,fetcher),null);body={...manifest,resources:[...manifest.resources,{path:future,group:'/records/weekly_report/'}]};clock=300001;assert.equal(await resolve(future,fetcher),'/records/weekly_report/');assert.equal(calls,2);
 assert.equal(await resolve('/arbitrary.json',fetcher),null);assert.equal(calls,2);
 for(const reply of [new Response('PRIVATE'),Response.json({...manifest,private:'PRIVATE'}),new Response('x'.repeat(65537),{headers:{'Content-Type':'application/json'}})]){let n=0;const r=createManifestResolver();assert.equal(await r('/index.json',async()=>{n++;return reply;}),null);assert.equal(await r('/index.json',async()=>{n++;throw Error('PRIVATE');}),null);assert.equal(n,1);}
});
test('every exact new JSON/policy success GET stores only category/domain/test; unknown/HEAD/404 excluded and origin retained',async()=>{
 for(const item of manifest.resources){
  const events=[],tasks=[],resolve=createManifestResolver();const path=item.path+'?measurement=test&private=SECRET';const env={EDGE_ENABLED:'true',PUBLIC_PAGES:'["/","/experiment/"]',COUNTER:{idFromName:n=>n,get:()=>({record:async e=>events.push(e)})}};const ctx={passThroughOnException(){},waitUntil:p=>tasks.push(p)};
  const req=new Request('https://aicqsohoo.com'+path,{headers:{Referer:'https://search.example/private?SECRET',Cookie:'SECRET', 'User-Agent':'SECRET', 'CF-Connecting-IP':'192.0.2.1'}});const origin=new Response('original body');
  const response=await proxySite(req,env,ctx,async r=>r.url.endsWith('/measurement-manifest.json')?manifestReply():origin,resolve);await Promise.all(tasks);assert.deepEqual(events,[{page:item.group,event:'resource_get',source:'search.example',test:true}]);assert.equal(await response.text(),'original body');assert.equal(response.headers.get('X-AICQSOHOO-Test-Measurement'),'recorded');assert.equal(JSON.stringify(events).includes('SECRET'),false);assert.equal(JSON.stringify(events).includes('192.0.2.1'),false);
 }
 for(const [path,method,status] of [['/index.json','HEAD',200],['/index.json','GET',404],['/index.json','POST',200],['/records/weekly_report/unknown.en.json','GET',200],['/records/experience/id.en.json/private','GET',200]]){
  let n=0;const tasks=[],req=new Request('https://aicqsohoo.com'+path,{method}),origin=new Response('original',{status});const result=await proxySite(req,{EDGE_ENABLED:'true',PUBLIC_PAGES:'[]',COUNTER:{idFromName:n=>n,get:()=>({record:async()=>n++})}},{passThroughOnException(){},waitUntil:p=>tasks.push(p)},async r=>r.url.endsWith('/measurement-manifest.json')?manifestReply():origin,createManifestResolver());await Promise.all(tasks);assert.equal(n,0);assert.equal(result,origin);
 }
 const testRows=manifest.resources.map(r=>({page:r.group,event:'resource_get',source:'search.example',test:true,n:100}));assert.equal(disclose(testRows).resource_gets,null);const ordinary={page:'/records/weekly_report/',event:'resource_get',source:'search.example',test:false,n:19};const summary=disclose([...testRows,ordinary]);assert.equal(summary.resource_gets,10);assert.deepEqual(summary.frequent_referrer_domains,[]);assert.deepEqual(summary.frequent_pages,[]);assert.equal(summary.page_views,null);
});
