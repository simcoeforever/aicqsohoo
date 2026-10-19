// Local-only real Plaza API + SQLite, used by the browser smoke test. No live posts.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Plaza,createPlazaRoute} from '../worker/src/plaza.js';
const db=new DatabaseSync(':memory:');
const storage={sql:{exec(q,...args){const s=db.prepare(q),rows=s.columns().length?s.all(...args):(s.run(...args),[]);return {toArray:()=>rows,one:()=>rows[0]};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
const plaza=new Plaza(storage),route=createPlazaRoute(),env={COUNTER:{idFromName:n=>n,get:()=>({listPlaza:o=>plaza.list(o),acceptPlaza:b=>plaza.accept(b)})}};
const site=resolve('site');
createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:8000');
  if(url.pathname.startsWith('/plaza/posts')||url.pathname==='/plaza/info'){
   const chunks=[];for await(const c of req)chunks.push(c);
   const headers=new Headers(req.headers);
   if(headers.get('Origin')===url.origin)headers.set('Origin','https://aicqsohoo.com');
   const r=await route(new Request(url,{method:req.method,headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}),env);
   res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));return;
  }
  const path=resolve(site,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
  if(!path.startsWith(site+'/')){res.writeHead(403);res.end();return;}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));
 }catch{res.writeHead(404);res.end();}
}).listen(Number(process.env.PLAZA_TEST_PORT||8000),'127.0.0.1',()=>console.log('Local Plaza fixture ready'));
