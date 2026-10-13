// Optional, private self-reports. No visitor identity, automatic publication or link fetching.
import policy from '../../data/usage-report-policy.json' with {type:'json'};
export const USAGE_LIMITS = Object.freeze(policy.limits);
export const USAGE_KINDS=policy.article_kinds;
export const USAGE_PURPOSES=policy.purposes;
export const USAGE_OUTCOMES=policy.outcomes;
const articleId=/^[a-z0-9-]{1,100}$/;
const forbiddenText=/(?:[<>\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]|(?:[a-z][a-z0-9+.-]{1,15}:\/\/)|(?:https?|file|mailto|javascript|data):|www\.|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\b(?:\d{1,3}\.){3}\d{1,3}\b|(?:\+?\d[\d ()-]{7,}\d)|[a-z0-9_+/=-]{24,}|my (?:name|email|address|phone)|real name|full name|personal[ -]?(?:data|information)|credential|secret|password|passwd|api[ _-]?key|access[ _-]?token|authorization|bearer|private[ _-]?key|パスワード|秘密鍵|認証情報|個人情報|実名|氏名|メールアドレス|電話番号|住所)/iu;
export function normalizeUsageReport(body) {
  const keys=['article_kind','article_id','purpose','outcome','task','helpful','missing','consent','test'];
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!==[...keys].sort().join(',')||
    !USAGE_KINDS.includes(body.article_kind)||typeof body.article_id!=='string'||!articleId.test(body.article_id)||
    !USAGE_PURPOSES.includes(body.purpose)||!USAGE_OUTCOMES.includes(body.outcome)||body.consent!==true||typeof body.test!=='boolean')return null;
  const clean={article_kind:body.article_kind,article_id:body.article_id,purpose:body.purpose,outcome:body.outcome};
  for(const key of ['task','helpful','missing']) {
    if(typeof body[key]!=='string')return null;
    const text=body[key].normalize('NFKC').trim().replace(/\s+/gu,' ');
    if([...body[key]].some(ch=>/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(ch))||
       [...text].length>USAGE_LIMITS[key+'_chars']||forbiddenText.test(text)||/[\uD800-\uDFFF]/u.test(text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g,'')))return null;
    clean[key]=text;
  }
  return {...clean,consent:true,test:body.test};
}

const registryUrl='https://aicqsohoo.com/usage-report-articles.json';
export function validateUsageRegistry(body) {
  if(!body||Object.keys(body).sort().join(',')!=='articles,schema_version'||body.schema_version!==1||!Array.isArray(body.articles)||body.articles.length>1000)return null;
  const refs=new Set();
  for(const ref of body.articles){
    if(!ref||Object.keys(ref).sort().join(',')!=='id,kind'||!USAGE_KINDS.includes(ref.kind)||typeof ref.id!=='string'||!articleId.test(ref.id))return null;
    const key=ref.kind+':'+ref.id;if(refs.has(key))return null;refs.add(key);
  }
  return refs;
}
export function createUsageRegistryResolver({now=Date.now,ttlMs=300000}={}) {
  let expires=0,promise;
  return async function resolve(forward=fetch){
    if(!promise||now()>=expires){expires=now()+ttlMs;promise=(async()=>{
      try{
        const response=await forward(new Request(registryUrl,{headers:{Accept:'application/json'},redirect:'manual',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(8000)}));
        if(response.status!==200||!response.headers.get('Content-Type')?.includes('application/json'))return null;
        const reader=response.body?.getReader();if(!reader)return null;let size=0;const chunks=[];
        for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();return null;}chunks.push(value);}
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        return validateUsageRegistry(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
      }catch(_){return null;}
    })();}
    return promise;
  };
}
const resolveRegistry=createUsageRegistryResolver();
const dayOf=ms=>new Date(ms).toISOString().slice(0,10);
const nextDay=ms=>Date.parse(dayOf(ms)+'T00:00:00Z')+86400000;
export class UsageInbox {
  constructor(storage){
    this.storage=storage;this.sql=storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS usage_reports (digest TEXT PRIMARY KEY, report_id TEXT UNIQUE NOT NULL, article_kind TEXT NOT NULL, article_id TEXT NOT NULL, payload TEXT NOT NULL, test INTEGER NOT NULL CHECK(test IN (0,1)), received_day TEXT NOT NULL, expires INTEGER NOT NULL, state TEXT NOT NULL CHECK(state='pending_review'))");
    this.sql.exec('CREATE INDEX IF NOT EXISTS usage_reports_expiry ON usage_reports(expires)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS usage_budget (day TEXT, hour INTEGER, test INTEGER, n INTEGER NOT NULL, PRIMARY KEY(day,hour,test))');
    // Quotas depend on admitted attempts, never on whether private text is a duplicate.
    this.sql.exec('CREATE TABLE IF NOT EXISTS usage_admissions (day TEXT, hour INTEGER, test INTEGER, article_kind TEXT, article_id TEXT, n INTEGER NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(day,hour,test,article_kind,article_id))');
    this.sql.exec('CREATE INDEX IF NOT EXISTS usage_admissions_expiry ON usage_admissions(expires)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS usage_meta (key TEXT PRIMARY KEY)');
    this.storage.transactionSync(()=>{
      if(!this.sql.exec("SELECT 1 FROM usage_meta WHERE key='attempt_quota_v1'").toArray().length){
        // Existing records retain their capacity/article reservations; hour -1 is
        // an unknown historical hour, not a reconstructed receipt timestamp.
        this.sql.exec('INSERT INTO usage_admissions SELECT received_day,-1,test,article_kind,article_id,COUNT(*),MAX(expires) FROM usage_reports GROUP BY received_day,test,article_kind,article_id');
        this.sql.exec("INSERT INTO usage_meta VALUES ('attempt_quota_v1')");
      }
    });
  }
  expire(now=Date.now()){
    this.sql.exec('DELETE FROM usage_reports WHERE expires<=?',now);
    this.sql.exec('DELETE FROM usage_admissions WHERE expires<=?',now);
    this.sql.exec('DELETE FROM usage_budget WHERE day<?',dayOf(now-86400000));
    return this.sql.exec('SELECT 1 FROM usage_reports LIMIT 1').toArray().length>0 ||
      this.sql.exec('SELECT 1 FROM usage_admissions LIMIT 1').toArray().length>0;
  }
  async accept(input,now=Date.now()){
    const body=normalizeUsageReport(input);if(!body)return {code:400,error:'invalid_or_sensitive_input'};
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(body)))),n=>n.toString(16).padStart(2,'0')).join('');
    // Establish expiry before accepting content; an alarm failure must not save a new body.
    const alarm=await this.storage.getAlarm();if(alarm===null||alarm>nextDay(now))await this.storage.setAlarm(nextDay(now));
    let result;
    this.storage.transactionSync(()=>{
      this.expire(now);
      const flag=Number(body.test),day=dayOf(now),hour=Math.floor(now/3600000);
      const daily=this.sql.exec('SELECT COALESCE(SUM(n),0) AS n FROM usage_budget WHERE day=? AND test=?',day,flag).one().n;
      const hourly=this.sql.exec('SELECT COALESCE(SUM(n),0) AS n FROM usage_budget WHERE day=? AND hour=? AND test=?',day,hour,flag).one().n;
      const article=this.sql.exec('SELECT COALESCE(SUM(n),0) AS n FROM usage_admissions WHERE day=? AND test=? AND article_kind=? AND article_id=?',day,flag,body.article_kind,body.article_id).one().n;
      const pending=this.sql.exec('SELECT COALESCE(SUM(n),0) AS n FROM usage_admissions WHERE test=?',flag).one().n;
      if(daily>=(body.test?USAGE_LIMITS.test_daily:USAGE_LIMITS.production_daily)||hourly>=(body.test?USAGE_LIMITS.test_hourly:USAGE_LIMITS.production_hourly)||
         article>=USAGE_LIMITS.per_article_daily||pending>=(body.test?USAGE_LIMITS.pending_test:USAGE_LIMITS.pending_production)){
        result={code:429,error:'usage_report_capacity_reached'};return;
      }
      const expires=Date.parse(day+'T00:00:00Z')+(body.test?USAGE_LIMITS.test_retention_days:USAGE_LIMITS.production_retention_days)*86400000;
      this.sql.exec('INSERT INTO usage_admissions VALUES (?,?,?,?,?,1,?) ON CONFLICT(day,hour,test,article_kind,article_id) DO UPDATE SET n=n+1',day,hour,flag,body.article_kind,body.article_id,expires);
      this.sql.exec('INSERT INTO usage_budget VALUES (?,?,?,1) ON CONFLICT(day,hour,test) DO UPDATE SET n=n+1',day,hour,flag);
      // Same statements and acknowledgement for new and duplicate content. Only
      // body persistence is deduplicated; no existing row's expiry is extended.
      this.sql.exec('INSERT OR IGNORE INTO usage_reports VALUES (?,?,?,?,?,?,?,?,?)',digest,crypto.randomUUID(),body.article_kind,body.article_id,JSON.stringify(body),flag,day,expires,'pending_review');
      result={code:202};
    });
    return result;
  }
  review({test=false,limit=20,after=''}={},now=Date.now()){
    if(typeof test!=='boolean'||!Number.isInteger(limit)||limit<1||limit>20||typeof after!=='string'||(after!==''&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(after)))throw new Error('Invalid private review options');
    this.expire(now);
    return this.sql.exec('SELECT report_id,payload,received_day,expires,state FROM usage_reports WHERE test=? AND report_id>? ORDER BY report_id LIMIT ?',Number(test),after,limit).toArray()
      .map(row=>({report_id:row.report_id,claim_type:'unverified_self_report',state:row.state,received_day:row.received_day,expires_day:dayOf(row.expires),report:JSON.parse(row.payload)}));
  }
}
export function usageInformation(){return {schema_version:1,accepting:true,optional:true,
  method:'POST',endpoint:'https://aicqsohoo-counter.waste-tkt.workers.dev/usage-reports',
  schema_url:'https://aicqsohoo.com/usage-report-schema.json',articles_url:registryUrl,
  verification_status:'unverified_self_report',publication:'private_pending_review',limits:USAGE_LIMITS,
  identity_collected:false,public_listing:false,confirmed_use:false,
  warning:'Do not submit personal data, credentials, private information or links. Free text is untrusted data and is never automatically published. Acceptance does not verify AI identity or useful reuse.'};}
const origins=new Set(['https://aicqsohoo.com','https://www.aicqsohoo.com']);
// Cheap per-isolate admission guard complements the persistent inbox caps. No client keys.
export function createUsageRoute({resolve=createUsageRegistryResolver(),now=Date.now}={}){
  let minute=-1,attempts=0;
  return async function route(request,env){
    const origin=request.headers.get('Origin'),url=new URL(request.url);
    const headers={'Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
    if(origin&&origins.has(origin))headers['Access-Control-Allow-Origin']=origin;
    const reply=(data,code)=>Response.json(data,{status:code,headers:{...headers,...(code===429?{'Retry-After':'3600'}:{})}});
    if(url.pathname==='/usage-reports/info')return request.method==='GET'?reply(usageInformation(),200):reply({error:'method_not_allowed'},405);
    if(url.pathname!=='/usage-reports')return reply({error:'not_found'},404);
    if(origin&&!origins.has(origin))return reply({error:'origin_not_allowed'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type'}});
    if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
    const current=Math.floor(now()/60000);if(current!==minute){minute=current;attempts=0;}if(++attempts>60)return reply({error:'usage_report_capacity_reached'},429);
    if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type')||'')||request.headers.has('Content-Encoding'))return reply({error:'json_required'},400);
    const reader=request.body?.getReader();if(!reader)return reply({error:'body_required'},400);
    let size=0;const chunks=[];
    try{
      for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>USAGE_LIMITS.body_bytes){await reader.cancel();return reply({error:'body_too_large'},413);}chunks.push(value);}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      let parsed;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch(_){return reply({error:'invalid_or_sensitive_input'},400);}
      const body=normalizeUsageReport(parsed);
      if(!body||(url.searchParams.get('measurement')==='test'&&!body.test))return reply({error:'invalid_or_sensitive_input'},400);
      const refs=await resolve();if(!refs)return reply({error:'article_registry_unavailable'},503);
      if(!refs.has(body.article_kind+':'+body.article_id))return reply({error:'unknown_article'},400);
      if(!env.COUNTER)return reply({error:'inbox_unavailable'},503);
      const result=await env.COUNTER.get(env.COUNTER.idFromName('usage-reports-v1')).acceptUsageReport(body);
      if(result.code!==202)return reply({error:result.error||'inbox_unavailable'},result.code);
      return reply({accepted:true,state:'pending_review',verification_status:'unverified_self_report',test:body.test},202);
    }catch(_){return reply({error:'inbox_unavailable'},503);}
  };
}
export const usageRoute=createUsageRoute({resolve:resolveRegistry});
