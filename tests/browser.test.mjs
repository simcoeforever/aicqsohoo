import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const script = readFileSync(new URL('../static/metrics.js',import.meta.url),'utf8');
function run(hostname, search='', referrer='https://search.example/private?q=secret') {
  const calls = []; const links = [];
  const context = {URL,URLSearchParams,location:{hostname,search},window:{fetch:true},
    fetch:(url,opts) => {calls.push({url,opts}); return Promise.resolve();},
    document:{referrer,getElementById:()=>({getAttribute:n=>n==='data-page'?'/submit/':'https://counter.example/event'}),
      querySelectorAll:()=>[{addEventListener:(_,fn)=>links.push(fn)}]}};
  vm.runInNewContext(script,context); return {calls, links};
}
test('browser sends only domain and explicit test status; submission click separate',()=>{
  const {calls,links}=run('aicqsohoo.com','?measurement=test&private=secret');
  assert.deepEqual(JSON.parse(calls[0].opts.body),{page:'/submit/',event:'page_view',source:'search.example',test:true});
  assert.equal(calls[0].opts.credentials,'omit'); assert.equal(calls[0].opts.referrerPolicy,'no-referrer');
  links[0](); assert.equal(JSON.parse(calls[1].opts.body).event,'submission_intent');
  assert.equal(JSON.stringify(calls).includes('secret'),false);
});
test('local preview never sends; empty and internal referrers remain explicit',()=>{
  assert.equal(run('localhost').calls.length,0);
  assert.equal(JSON.parse(run('aicqsohoo.com','','').calls[0].opts.body).source,'unknown');
  assert.equal(JSON.parse(run('aicqsohoo.com','','https://aicqsohoo.com/about/').calls[0].opts.body).source,'internal');
});
