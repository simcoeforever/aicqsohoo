import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const script=readFileSync(new URL('../static/usage-report.js',import.meta.url),'utf8');
function fixture(host='aicqsohoo.com',search='',response=202,lang='en'){
 let handler;const calls=[],status={textContent:''},mode={hidden:true,textContent:'',style:{}},button={disabled:true,textContent:'Send optional report'};
 const values={article:'experience:stop-or-go-get-evidence',purpose:'solve_problem',outcome:'partly_helpful',task:'Synthetic local check',helpful:'A useful isolated test',missing:'More version detail',consent:'on'};
 let resets=0;
 const form={dataset:{language:lang,endpoint:'https://counter.example/usage-reports'},querySelector:()=>button,addEventListener:(_,fn)=>{handler=fn;},reportValidity:()=>true,reset:()=>{resets++;}};
 const context={URLSearchParams,AbortSignal,location:{hostname:host,search},document:{getElementById:id=>id==='usage-report-form'?form:id==='usage-report-mode'?mode:status},
  FormData:class{get(key){return values[key];}},fetch:async(url,options)=>{calls.push({url,options});return {status:response,json:()=>{throw Error('Untrusted response text must never be displayed');}};}};
 vm.runInNewContext(script,context);
 return {calls,status,button,mode,location:context.location,submit:()=>handler?.({preventDefault(){}}),resets:()=>resets};
}
test('form is opt-in with no automatic traffic, storage, referrer or identity; acknowledgement remains unverified',async()=>{
 const f=fixture();assert.equal(f.calls.length,0);assert.equal(f.button.disabled,false);
 await f.submit();assert.equal(f.calls.length,1);
 const opts=f.calls[0].options;assert.equal(opts.credentials,'omit');assert.equal(opts.referrerPolicy,'no-referrer');
 const body=JSON.parse(opts.body);assert.equal(body.test,false);assert.equal(body.consent,true);
 assert.deepEqual(Object.keys(body).sort(),['article_kind','article_id','consent','helpful','missing','outcome','purpose','task','test'].sort());
 assert.match(f.status.textContent,/private, unverified/);assert.equal(f.resets(),1);
});
test('local preview never sends; explicit marked tests stay separate; errors never echo remote text',async()=>{
 const local=fixture('localhost');assert.equal(local.button.disabled,true);await local.submit();assert.equal(local.calls.length,0);
 const marked=fixture('aicqsohoo.com','?measurement=test&unrelated=not-sent');await marked.submit();assert.equal(JSON.parse(marked.calls[0].options.body).test,true);
 assert.match(marked.status.textContent,/isolated test/);assert.equal(JSON.stringify(marked.calls).includes('unrelated'),false);
 const invalid=fixture('aicqsohoo.com','',400);await invalid.submit();assert.match(invalid.status.textContent,/privacy limits/);assert.equal(invalid.resets(),0);
});

test('English/Japanese test mode is visible before posting and remains test after URL editing; normal mode stays optional',async()=>{
 for(const lang of ['en','ja']){
  const f=fixture('aicqsohoo.com','?measurement=test',202,lang);
  assert.equal(f.calls.length,0);assert.equal(f.mode.hidden,false);assert.equal(f.mode.style.fontWeight,'bold');
  assert.match(f.mode.textContent,lang==='ja'?/テストモード/:/TEST MODE/);
  assert.match(f.button.textContent,lang==='ja'?/テスト/:/test/);
  f.location.search='';await f.submit();assert.equal(JSON.parse(f.calls[0].options.body).test,true);
 }
 const normal=fixture();assert.equal(normal.mode.hidden,true);assert.equal(normal.button.textContent,'Send optional report');
});
