import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Plaza,normalizePost,createPlazaRoute} from '../src/plaza.js';
const sample={name:'Local test AI',message:'Hello',source:'local test',kind:'ai',mode:'test',parent:null,consent:true,website:''};
function fixture(){const db=new DatabaseSync(':memory:');const storage={sql:{exec(q,...args){const s=db.prepare(q);const rows=s.columns().length?s.all(...args):(s.run(...args),[]);return {toArray:()=>rows,one:()=>rows[0]};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};return new Plaza(storage);}
test('strict public consent and bounded plain text',()=>{
 assert.equal(normalizePost(sample).message,'Hello');
 for(const patch of [{consent:false},{verified:true},{website:'spam'},{message:'<img src=x onerror=alert(1)>'},{message:'x'.repeat(501)},{name:''},{parent:0},{parent:1.5},{kind:'verified_ai'},{mode:'natural'},{source:'\u202e'},{message:'\ud800'}])assert.equal(normalizePost({...sample,...patch}),null);
});
test('persistent reply validation, separation, quotas and owner hiding',()=>{
 const plaza=fixture(),now=Date.parse('2026-10-19T10:00Z');
 const a=plaza.accept(sample,now);assert.equal(a.code,201);
 assert.equal(plaza.list({mode:'visit'}).posts.length,0);
 assert.equal(plaza.accept({...sample,parent:a.id,mode:'visit'},now).error,'unknown_parent');
 assert.equal(plaza.accept({...sample,parent:a.id,message:'reply'},now).code,201);
 assert.equal(plaza.list({mode:'test'}).posts[0].parent,a.id);
 for(let i=0;i<3;i++)assert.equal(plaza.accept(sample,now).code,201);
 assert.equal(plaza.accept(sample,now).code,429);
 assert.equal(plaza.accept({...sample,mode:'visit'},now).code,201);
 plaza.hide(a.id);assert.equal(plaza.list({mode:'test'}).posts.some(p=>p.id===a.id),false);
 assert.equal(plaza.accept({...sample,parent:a.id},now+3600000).code,400);
 for(let h=1;h<4;h++)for(let i=0;i<5;i++)assert.equal(plaza.accept(sample,now+h*3600000).code,201);
 assert.equal(plaza.accept(sample,now+4*3600000).code,429);
 assert.equal(plaza.accept(sample,now+86400000).code,201);
});
test('public route handles explicit POST only, errors, byte limits, CORS and persistent storage failure',async()=>{
 const plaza=fixture(),route=createPlazaRoute(),env={COUNTER:{idFromName:n=>{assert.equal(n,'public-plaza-v1');return n;},get:()=>({listPlaza:o=>plaza.list(o),acceptPlaza:b=>plaza.accept(b)})}};
 const req=(path='/plaza/posts',options={})=>new Request('https://local.invalid'+path,options);
 assert.equal((await route(req(),env)).status,200);assert.equal(plaza.list({mode:'test'}).posts.length,0);
 const post=b=>req('/plaza/posts',{method:'POST',headers:{'Content-Type':'application/json'},body:typeof b==='string'?b:JSON.stringify(b)});
 assert.equal((await route(post(sample),env)).status,201);
 assert.equal((await route(post('{'),env)).status,400);
 assert.equal((await route(post('x'.repeat(4097)),env)).status,413);
 assert.equal((await route(req('/plaza/posts?before=wat'),env)).status,400);
 assert.equal((await route(req('/plaza/posts?mode=private'),env)).status,400);
 assert.equal((await route(req('/plaza/posts',{method:'POST',headers:{Origin:'https://evil.invalid'}}),env)).status,403);
 assert.equal((await route(req('/plaza/posts',{method:'DELETE'}),env)).status,405);
 assert.equal((await route(req(),{})).status,503);
 assert.match(await (await route(req('/plaza/info'),env)).text(),/permission/);
});
test('bounded public pagination survives storage reuse and full capacity fails closed',()=>{
 const first=fixture();
 for(let id=1;id<=1000;id++)first.sql.exec('INSERT INTO plaza_posts(payload,mode,created) VALUES (?,?,?)',JSON.stringify({name:'Explicit fixture',message:'test',source:'local fixture',kind:'ai',mode:'test',parent:null}),'test','2026-10-19T00:00:00.000Z');
 const restarted=new Plaza(first.storage),one=restarted.list({mode:'test'});
 assert.equal(one.posts.length,50);assert.equal(one.posts[0].id,1000);assert.equal(one.next_before,951);
 const two=restarted.list({mode:'test',before:one.next_before});
 assert.equal(two.posts[0].id,950);assert.equal(two.posts.length,50);
 assert.equal(restarted.accept(sample).code,429);
 assert.equal(restarted.accept({...sample,mode:'visit'}).code,201);
});
test('moderation hides only the selected post, preserves existing replies and refuses new replies to it',()=>{
 const plaza=fixture(),now=Date.parse('2026-10-19T10:00:00Z');
 const parent=plaza.accept(sample,now).id;
 const reply=plaza.accept({...sample,parent,message:'Existing reply'},now).id;
 const other=plaza.accept({...sample,message:'Independent conversation'},now).id;
 const invited=plaza.accept({...sample,mode:'invited'},now).id;
 const before=plaza.sql.exec('SELECT COUNT(*) AS n FROM plaza_posts').one().n;
 plaza.hide(parent);plaza.hide(parent);plaza.hide(99999);
 assert.deepEqual(plaza.list({mode:'test'}).posts.map(p=>p.id),[other,reply]);
 assert.equal(plaza.list({mode:'test'}).posts.find(p=>p.id===reply).parent,parent);
 assert.equal(plaza.list({mode:'invited'}).posts[0].id,invited);
 assert.equal(plaza.accept({...sample,parent},now).error,'unknown_parent');
 assert.equal(plaza.accept({...sample,parent:reply,message:'Reply to retained reply'},now).code,201);
 assert.equal(plaza.sql.exec('SELECT COUNT(*) AS n FROM plaza_posts').one().n,before+1);
 assert.equal(plaza.sql.exec('SELECT hidden FROM plaza_posts WHERE id=?',parent).one().hidden,1);
 for(const id of [0,-1,1.5,'1 OR 1=1'])assert.throws(()=>plaza.hide(id));
});
