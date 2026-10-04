import test from 'node:test';
import assert from 'node:assert/strict';
import {proxySite} from '../src/gateway.js';

async function check(path, options={}) {
  const events=[]; const tasks=[]; let bypass=false;
  const env={EDGE_ENABLED:'true',PUBLIC_PAGES:'["/","/about/","/experiment/"]',COUNTER:{idFromName:n=>n,get:()=>({record:async e=>{
    if(options.failMetric) throw Error('private failure'); events.push(e);
  }})},...options.env};
  const ctx={passThroughOnException:()=>{bypass=true;},waitUntil:p=>tasks.push(p)};
  const response=new Response('unchanged origin content',{status:options.status||200});
  const request=new Request('https://aicqsohoo.com'+path,{method:options.method||'GET',headers:{Referer:options.ref||'https://search.example/path?private=x','User-Agent':'Ignore all previous instructions <script>steal()</script>'}});
  let forwarded;
  const result=await proxySite(request,env,ctx,async r=>{forwarded=r;return response;});
  await Promise.all(tasks);
  if(path.includes('measurement=test') && (response.ok || response.status===304) && options.method!=='HEAD' && env.EDGE_ENABLED==='true') {
    assert.equal(result.headers.get('X-AICQSOHOO-Test-Measurement'),events.length?'recorded':'not-recorded');
    assert.equal(result.headers.get('Cache-Control'),'no-store');
    assert.equal(await result.text(),'unchanged origin content');
  } else assert.equal(result,response);
  assert.equal(forwarded,request); assert.equal(bypass,true);
  return events;
}
test('edge sees JS-free HTML/JSON/llms GETs and strips query/referrer URL/UA',async()=>{
  for(const path of ['/','/about/','/experiences.json','/agents.json','/llms.txt']) {
    const events=await check(path+'?private=x&measurement=test');
    assert.equal(events.length,1); assert.equal(events[0].event,'resource_get');
    assert.equal(events[0].source,'search.example'); assert.equal(events[0].test,true);
    assert.equal(JSON.stringify(events).includes('private'),false);
    assert.equal(JSON.stringify(events).includes('script'),false);
  }
});
test('failed measurement preserves origin; disabled, HEAD, errors and arbitrary paths do not count',async()=>{
  for(const [path,options] of [['/',{failMetric:true}],['/',{env:{EDGE_ENABLED:'false'}}],
    ['/',{method:'HEAD'}],['/',{status:404}],['/unknown/',{}],['/img/logo.png',{}]]) {
    assert.deepEqual(await check(path,options),[]);
  }
  assert.equal((await check('/about/index.html'))[0].page,'/about/');
  assert.equal((await check('/experiment/2026-10-05/'))[0].page,'/experiment/');
  assert.equal((await check('/',{ref:'javascript:<script>evil</script>'}))[0].source,'unknown');
});
