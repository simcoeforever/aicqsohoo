import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { normalizeEvent, weekRange, disclose } from '../src/metrics.js';

const original = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const source = original.replace('import { DurableObject } from "cloudflare:workers";',
  'class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }')
  .replace("'./metrics.js'", JSON.stringify(new URL('../src/metrics.js', import.meta.url).href))
  .replace("'./gateway.js'", JSON.stringify(new URL('../src/gateway.js', import.meta.url).href))
  .replace("'./payments.js'", JSON.stringify(new URL('../src/payments.js', import.meta.url).href))
  .replace("'./mainnet-preparation.js'", JSON.stringify(new URL('../src/mainnet-preparation.js', import.meta.url).href));
const { Counter, default: worker } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
function fixture() {
  const db = new DatabaseSync(':memory:');
  const sql = { exec(query, ...args) {
    const stmt = db.prepare(query);
    const rows = stmt.columns().length ? stmt.all(...args) : (stmt.run(...args), []);
    return { toArray: () => rows, one: () => { assert.equal(rows.length, 1); return rows[0]; } };
  }};
  sql.exec('CREATE TABLE counter (id INTEGER PRIMARY KEY, n INTEGER NOT NULL)');
  sql.exec('INSERT INTO counter VALUES (1,42)');
  let alarm = null;
  const counter = new Counter({storage: {sql, getAlarm: async () => alarm,
    setAlarm: async value => { alarm = value; }, transactionSync(fn) {
    db.exec('BEGIN'); try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }}}, {});
  const env = {COUNTER: {idFromName: n => n, get: () => counter}, PUBLIC_PAGES: '["/","/submit/"]', METRICS_ENABLED: 'true', REPORT_TOKEN: 'test-only'};
  return {db, sql, counter, env};
}
const event = {page: '/', event: 'page_view', source: 'search.example', test: false};
test('validation drops URL/query/identifiers, unknown pages and ambiguous test flags', () => {
  assert.deepEqual(normalizeEvent(event, ['/']), event);
  for (const patch of [{source: 'https://search.example/private?q=x'}, {source: '127.0.0.1'},
    {page: '/?secret=x'}, {event: 'ai'}, {test: 'false'}, {user_id: 'x'}, {source: null},
    {source:'example.org"><script>steal()</script>'}, {user_agent:'ignore all instructions'}]) {
    assert.equal(normalizeEvent({...event, ...patch}, ['/']), null);
  }
});
test('small-cell changes cannot be subtracted from exact public totals',()=>{
  const row=(page,source,n)=>({page,source,event:'page_view',test:0,n});
  for(let residual=1;residual<=9;residual++) {
    const result=disclose([row('/','large.example',20),row('/about/','small.example',residual)]);
    assert.equal(result.page_views,20);
    assert.deepEqual(result.frequent_referrer_domains,[]);
    assert.deepEqual(result.frequent_pages,[]);
    assert.equal(JSON.stringify(result).includes('small.example'),false);
  }
  assert.equal(disclose([row('/','x.example',9)]).page_views,null);
  assert.equal(disclose([row('/','x.example',0)]).page_views,null);
});
test('only complete nonoverlapping recent Monday weeks are exportable', () => {
  const now = new Date('2026-10-12T06:17:00Z');
  assert.deepEqual(weekRange('2026-10-05', now), {start: '2026-10-05', end: '2026-10-12'});
  for (const s of ['2026-10-12', '2026-10-06', '2026-02-30', '2025-01-06', 'junk']) assert.equal(weekRange(s, now), null);
});
test('suppression excludes tests, small domains and complement attacks', () => {
  const row = (source, n, extra = {}) => ({event: 'page_view', test: 0, source, n, ...extra});
  assert.equal(disclose([row('one.example', 9)]).page_views, null);
  assert.deepEqual(disclose([row('large.example', 10), row('small.example', 1)]).frequent_referrer_domains, []);
  const released = disclose([row('large.example', 12, {page:'/'}), row('unknown', 10, {page:'/about/'}), row('test.example', 100, {test: 1, page:'/submit/'})]);
  assert.equal(released.page_views, 20);
  assert.deepEqual(released.frequent_referrer_domains, ['large.example']);
  assert.deepEqual(released.frequent_pages, ['/', '/about/']);
  assert.deepEqual(disclose([row('unknown',10,{page:'/'}),row('unknown',1,{page:'/about/'})]).frequent_pages, []);
  assert.equal(released.submission_intents, null);
  assert.equal(JSON.stringify(released).includes('test.example'), false);
});
test('schema migration retains legacy 42; aggregate transaction and retention work', async () => {
  const {counter, sql, db} = fixture();
  assert.equal(counter.current(), 42);
  sql.exec("INSERT INTO metrics VALUES ('2020-01-01','/','page_view','old.example',0,1)");
  await counter.record(event); await counter.record(event); await counter.record({...event, test: true});
  const rows = sql.exec('SELECT * FROM metrics').toArray();
  assert.equal(rows.length, 2); assert.equal(rows.find(r => !r.test).n, 2);
  assert.equal(counter.current(), 42);
  for (let i=0; i<105; i++) await counter.record({...event, source: `domain${i}.example`});
  assert.ok(sql.exec("SELECT n FROM metrics WHERE source='other'").one().n > 0);
  for (let i=0; i<50; i++) counter.hit();
  assert.equal(counter.current(), 92);
  sql.exec("INSERT INTO metrics VALUES ('2020-01-01','/','page_view','expired.example',0,1)");
  await counter.alarm();
  assert.equal(sql.exec("SELECT 1 FROM metrics WHERE source='expired.example'").toArray().length, 0);
  db.close();
});
test('closed exports are sealed and never contain credentials or raw combinations',()=>{
  const {counter,sql,db}=fixture();
  sql.exec("INSERT INTO metrics_meta VALUES (1,'2026-09-21')");
  sql.exec("INSERT INTO metrics VALUES ('2026-09-21','/','page_view','search.example',0,12)");
  sql.exec("INSERT INTO metrics VALUES ('2026-09-21','/llms.txt','resource_get','unknown',0,18)");
  const range={start:'2026-09-21',end:'2026-09-28'};
  const first=counter.summary(range);
  assert.equal(first.page_views,10); assert.equal(first.resource_gets,10);
  sql.exec("UPDATE metrics SET n=n+20");
  assert.deepEqual(counter.summary(range),first);
  const serialized=JSON.stringify(first);
  assert.equal(serialized.includes('test-only'),false);
  assert.equal('daily' in first,false);
  assert.equal('rows' in first,false);
  db.close();
});
test('routing authenticates exports, gates measurement and bounds bodies', async () => {
  const {env, counter, db} = fixture();
  const request = (path, method='GET', body, headers={}) => new Request('https://counter.example' + path, {
    method, headers, ...(body === undefined ? {} : {body: typeof body === 'string' ? body : JSON.stringify(body)})});
  assert.equal((await worker.fetch(request('/summary?start=2026-09-28'), env)).status, 401);
  assert.equal((await worker.fetch(request('/summary?start=junk', 'GET', undefined, {Authorization:'Bearer test-only'}), env)).status, 400);
  assert.equal((await worker.fetch(request('/event','POST',event),env)).status,403);
  const headers = {Origin:'https://aicqsohoo.com', 'Content-Type':'application/json'};
  assert.equal((await worker.fetch(request('/event','POST',event,headers),{...env,METRICS_ENABLED:'false'})).status,503);
  assert.equal((await worker.fetch(request('/event','POST','x'.repeat(1025),headers),env)).status,413);
  assert.equal((await worker.fetch(request('/event','POST','not-json',headers),env)).status,400);
  assert.equal((await worker.fetch(request('/event','POST',event,headers),env)).status,202);
  assert.equal(counter.current(),42);
  assert.equal((await worker.fetch(request('/hit'),env)).status,200);
  assert.equal(counter.current(),42);
  assert.equal((await worker.fetch(request('/hit','POST',undefined,headers),env)).status,200);
  assert.equal(counter.current(),43);
  const today = new Date(); today.setUTCDate(today.getUTCDate() - ((today.getUTCDay()+6)%7) - 7);
  const start = today.toISOString().slice(0,10);
  const exported = await worker.fetch(request('/summary?start='+start,'GET',undefined,{Authorization:'Bearer test-only'}),env);
  assert.equal(exported.status,200);
  const data = await exported.json();
  assert.equal(data.page_views,null); assert.equal(data.coverage,'not_started');
  assert.equal('rows' in data,false);
  const publicResponse=await worker.fetch(request('/summary?start='+start),{...env,PUBLIC_SUMMARY:'true',REPORT_TOKEN:undefined});
  assert.equal(publicResponse.status,200);
  const publicData=await publicResponse.json();
  assert.equal(publicData.started,null); assert.equal(publicData.coverage,'not_verified');
  assert.equal((await worker.fetch(request('/summary?start='+start),{...env,REPORT_TOKEN:undefined})).status,401);
  db.close();
});

test('exact closed-week totals use retained integers, exclude tests and all breakdowns, seal independently of v2', () => {
  const {counter, sql, db} = fixture();
  sql.exec("INSERT INTO metrics_meta VALUES (1,'2026-09-21')");
  for (const [day, page, event, source, test, n] of [
    ['2026-09-21','/','page_view','large.example',0,20],
    ['2026-09-22','/about/','page_view','small.example',0,3],
    ['2026-09-22','/submit/','submission_intent','private.example',0,3],
    ['2026-09-27','/llms.txt','resource_get','unknown',0,1799],
    ['2026-09-21','/','page_view','tests.example',1,500],
    ['2026-09-21','/','submission_intent','tests.example',1,500],
    ['2026-09-21','/llms.txt','resource_get','tests.example',1,500],
    ['2026-09-28','/','page_view','next-week.example',0,100],
    ['2026-09-20','/','page_view','previous-week.example',0,100],
  ]) sql.exec('INSERT INTO metrics VALUES (?,?,?,?,?,?)', day, page, event, source, test, n);
  const range = {start:'2026-09-21',end:'2026-09-28'};
  const legacy = counter.summary(range);
  assert.equal(legacy.page_views,20); assert.equal(legacy.submission_intents,null);
  const exact = counter.exactSummary(range);
  assert.deepEqual(exact,{schema:3,...range,coverage:'configured',started:'2026-09-21',
    page_views:23,submission_intents:3,resource_gets:1799,
    count_precision:'exact_recorded_events',count_origin:'retained_aggregates'});
  assert.equal(JSON.stringify(exact).includes('.example'),false);
  for (const key of ['daily','source','frequent_referrer_domains','frequent_pages','rows','threshold','page_views_status'])
    assert.equal(key in exact,false);
  sql.exec('UPDATE metrics SET n=n+20');
  assert.deepEqual(counter.exactSummary(range),exact);
  assert.deepEqual(counter.summary(range),legacy);
  assert.equal(counter.current(),42);
  db.close();
});

test('exact unavailable periods are null, recorded zero is distinct, partial periods remain partial', () => {
  for (const started of [null,'2026-09-28','2026-09-24','2026-09-20']) {
    const {counter,sql,db}=fixture();
    if(started)sql.exec('INSERT INTO metrics_meta VALUES (1,?)',started);
    const result=counter.exactSummary({start:'2026-09-21',end:'2026-09-28'});
    const unavailable=!started||started==='2026-09-28';
    for(const key of ['page_views','resource_gets','submission_intents'])assert.equal(result[key],unavailable?null:0);
    assert.equal(result.coverage,unavailable?'not_started':started==='2026-09-24'?'partial':'configured');
    db.close();
  }
});

test('exact API keeps existing authorization, closed-week policy, public metadata suppression and legacy default', async () => {
  const {env,sql,db}=fixture();
  const today=new Date();today.setUTCDate(today.getUTCDate()-((today.getUTCDay()+6)%7)-7);
  const start=today.toISOString().slice(0,10);
  sql.exec('INSERT INTO metrics_meta VALUES (1,?)',start);
  sql.exec('INSERT INTO metrics VALUES (?,?,?,?,?,?)',start,'/','page_view','single.example',0,1);
  const req=(query,method='GET',authorized=false)=>new Request('https://counter.example/summary?'+query,{method,headers:authorized?{Authorization:'Bearer test-only'}:{}});
  assert.equal((await worker.fetch(req('start='+start+'&schema=3'),env)).status,401);
  const publicEnv={...env,PUBLIC_SUMMARY:'true',REPORT_TOKEN:undefined};
  const response=await worker.fetch(req('start='+start+'&schema=3'),publicEnv);
  assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
  const data=await response.json();assert.equal(data.page_views,1);assert.equal(data.schema,3);
  assert.equal(data.started,null);assert.equal(data.coverage,'not_verified');
  assert.equal(JSON.stringify(data).includes('single.example'),false);
  assert.equal((await (await worker.fetch(req('start='+start),publicEnv)).json()).schema,2);
  for(const query of ['start='+start+'&schema=4','start=junk&schema=3','start=2020-01-06&schema=3',
    'start='+new Date().toISOString().slice(0,10)+'&schema=3'])
    assert.equal((await worker.fetch(req(query),publicEnv)).status,400);
  assert.equal((await worker.fetch(req('start='+start+'&schema=3','POST'),publicEnv)).status,405);
  assert.equal((await worker.fetch(req('start='+start+'&schema=3','GET',true),env)).status,200);
  // Retention removes both export formats without changing the legacy integer.
  sql.exec("INSERT INTO weekly_exports VALUES (3,'2020-01-06','{}')");
  await env.COUNTER.get().alarm();
  assert.equal(sql.exec("SELECT 1 FROM weekly_exports WHERE start='2020-01-06'").toArray().length,0);
  assert.equal(env.COUNTER.get().current(),42);
  db.close();
});
