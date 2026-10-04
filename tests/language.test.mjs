import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const code=fs.readFileSync(new URL('../static/language.js',import.meta.url),'utf8');
function visit({path='/experiences/example/',lang='en',stored=null,languages=['ja-JP'],blocked=false}={}) {
  const destination=path.replace(/^\/ja/, '');
  const links=['en','ja'].map(locale=>({dataset:{language:locale},href:(locale==='ja'?'/ja':'')+destination.split('?')[0]+'?lang='+locale,addEventListener(type,fn){this.click=fn;}}));
  const saves=[],redirects=[];
  const context={URL,location:{href:'https://aicqsohoo.com'+path,replace:url=>redirects.push(url)},navigator:{languages},localStorage:{getItem(){if(blocked)throw Error();return stored;},setItem(key,value){if(blocked)throw Error();saves.push([key,value]);}},document:{documentElement:{lang,dataset:{}},querySelectorAll:()=>links}};
  vm.runInNewContext(code,context);
  return {links,saves,redirects,document:context.document};
}
test('initial browser choice preserves the deep link, query and anchor and uses replace',()=>{
  const r=visit({path:'/experiences/example/?measurement=test#outcome'});
  assert.equal(r.redirects[0],'https://aicqsohoo.com/ja/experiences/example/?measurement=test&lang=ja#outcome');
  assert.equal(r.document.documentElement.dataset.languageRedirect,'pending');
  assert.equal(visit({path:new URL(r.redirects[0]).pathname+new URL(r.redirects[0]).search,lang:'ja'}).redirects.length,0);
});
test('saved manual choice wins over browser; explicit language wins over saved',()=>{
  assert.equal(visit({stored:'en'}).redirects.length,0);
  assert.equal(visit({stored:'ja',languages:['en-US']}).redirects.length,1);
  assert.equal(visit({path:'/experiences/example/?lang=en',stored:'ja'}).redirects.length,0);
  assert.equal(visit({path:'/ja/experiences/example/',lang:'ja',stored:'en',languages:['en']}).redirects.length,0);
  const r=visit({path:'/ja/experiences/example/?lang=en',lang:'ja'});
  assert.equal(r.redirects[0],'https://aicqsohoo.com/experiences/example/?lang=en');
});
test('manual switch persists only locale, works with blocked storage and unsupported languages',()=>{
  const r=visit({languages:['fr-FR']});
  assert.equal(r.redirects.length,0);
  r.links[1].click();
  assert.deepEqual(r.saves,[['aicqsohoo-language','ja']]);
  assert.equal(visit({blocked:true,path:'/experiences/example/?lang=en'}).redirects.length,0);
  assert.equal(visit({blocked:true,path:'/ja/experiences/example/?lang=ja',lang:'ja'}).redirects.length,0);
  assert.equal(visit({stored:'untrusted',languages:['fr','en-GB','ja']}).redirects.length,0);
});
