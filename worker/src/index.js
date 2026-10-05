// AICQSOHOO! hit counter: one Worker plus one SQLite-backed Durable Object.
//
// POST /hit  -> increments the counter and returns {"count": n}
// GET  /hit  -> returns the current count without incrementing
//
// Legacy integer plus opt-in daily aggregates. No visitor records or identifiers.
import { DurableObject } from "cloudflare:workers";
import { normalizeEvent, weekRange, disclose } from './metrics.js';
import { proxySite } from './gateway.js';
import {PaymentService,paymentRoute} from './payments.js';
import {MainnetPreparationService} from './mainnet-preparation.js';
export class MainnetPayments extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.service=new MainnetPreparationService(ctx,env);}
  fetch(request){return this.service.fetch(request);}
}
export class Payments extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.service=new PaymentService(ctx,env);}
  fetch(request){return this.service.fetch(request);}
}

const ALLOWED_ORIGINS = new Set([
  "https://aicqsohoo.com",
  "https://www.aicqsohoo.com",
]);

export class Counter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY, n INTEGER NOT NULL)"
    );
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS metrics_meta (id INTEGER PRIMARY KEY, started TEXT NOT NULL)");
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS metrics (day TEXT, page TEXT, event TEXT, source TEXT, test INTEGER, n INTEGER NOT NULL, PRIMARY KEY(day,page,event,source,test))");
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS weekly_exports (version INTEGER, start TEXT, payload TEXT NOT NULL, PRIMARY KEY(version,start))");
  }

  // A Durable Object handles one request at a time, and this is a single SQL
  // statement, so two simultaneous hits can never read the same old value.
  hit() {
    return this.ctx.storage.sql
      .exec(
        "INSERT INTO counter (id, n) VALUES (1, 1) " +
          "ON CONFLICT (id) DO UPDATE SET n = n + 1 RETURNING n"
      )
      .one().n;
  }

  current() {
    const row = this.ctx.storage.sql.exec("SELECT n FROM counter WHERE id = 1").toArray()[0];
    return row ? row.n : 0;
  }

  async record(event) {
    const day = new Date().toISOString().slice(0, 10);
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("INSERT OR IGNORE INTO metrics_meta VALUES (1, ?)", day);
      this.ctx.storage.sql.exec("DELETE FROM metrics WHERE day < ?", new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
      // Bound hostile domain cardinality: fold new sources into 'other' after 100/day.
      const known = this.ctx.storage.sql.exec("SELECT 1 FROM metrics WHERE day=? AND source=? LIMIT 1", day, event.source).toArray();
      const size = this.ctx.storage.sql.exec("SELECT COUNT(DISTINCT source) AS n FROM metrics WHERE day=?", day).one().n;
      const source = !known.length && size >= 100 ? 'other' : event.source;
      this.ctx.storage.sql.exec("INSERT INTO metrics VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT(day,page,event,source,test) DO UPDATE SET n=n+1", day, event.page, event.event, source, Number(event.test));
    });
    if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(Date.now() + 86400000);
  }

  async alarm() {
    this.ctx.storage.sql.exec("DELETE FROM metrics WHERE day < ?", new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
    this.ctx.storage.sql.exec('DELETE FROM weekly_exports WHERE start < ?', new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
    if (this.ctx.storage.sql.exec('SELECT 1 FROM metrics LIMIT 1').toArray().length) {
      await this.ctx.storage.setAlarm(Date.now() + 86400000);
    }
  }

  summary(range) {
    this.ctx.storage.sql.exec('DELETE FROM weekly_exports WHERE start < ?', new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
    const sealed = this.ctx.storage.sql.exec('SELECT payload FROM weekly_exports WHERE version=2 AND start=?', range.start).toArray()[0];
    if (sealed) return JSON.parse(sealed.payload);
    const meta = this.ctx.storage.sql.exec("SELECT started FROM metrics_meta WHERE id=1").toArray()[0];
    const rows = this.ctx.storage.sql.exec("SELECT page,event,source,test,SUM(n) AS n FROM metrics WHERE day>=? AND day<? GROUP BY page,event,source,test", range.start, range.end).toArray();
    const report = { schema: 2, ...range, coverage: !meta || meta.started >= range.end ? 'not_started' : meta.started > range.start ? 'partial' : 'configured', started: meta?.started || null, ...disclose(rows) };
    this.ctx.storage.sql.exec('INSERT INTO weekly_exports VALUES (2,?,?)', range.start, JSON.stringify(report));
    return report;
  }
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const extra = (env.EXTRA_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (origin && (ALLOWED_ORIGINS.has(origin) || extra.includes(origin))) {
    return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
  }
  return { Vary: "Origin" };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if(url.pathname.startsWith('/contribution/'))return paymentRoute(request,env);
    if (ALLOWED_ORIGINS.has(url.origin)) return proxySite(request, env, ctx);
    const cors = corsHeaders(request, env);

    if (url.pathname === '/summary') {
      if (request.method !== 'GET') return json({error: 'method not allowed'}, 405, {});
      if (env.PUBLIC_SUMMARY !== 'true' && (!env.REPORT_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.REPORT_TOKEN}`)) return json({error: 'unauthorized'}, 401, {});
      const range = weekRange(url.searchParams.get('start'));
      if (!range) return json({error: 'closed Monday UTC week required (last 84 days)'}, 400, {});
      const counter = env.COUNTER.get(env.COUNTER.idFromName('site'));
      const summary = await counter.summary(range);
      if (env.PUBLIC_SUMMARY === 'true') { summary.started = null; summary.coverage = 'not_verified'; }
      return json(summary, 200, {});
    }
    if (url.pathname === '/event') {
      if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: {...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type'}});
      if (request.method !== 'POST') return json({error: 'method not allowed'}, 405, cors);
      if (!cors['Access-Control-Allow-Origin']) return json({error: 'origin not allowed'}, 403, cors);
      if (env.METRICS_ENABLED !== 'true') return json({error: 'measurement disabled'}, 503, cors);
      // Read at most 1 KiB, even if Content-Length is absent or dishonest.
      const reader = request.body?.getReader();
      if (!reader) return json({error: 'body required'}, 400, cors);
      let bytes = new Uint8Array(0);
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        if (bytes.length + value.length > 1024) { await reader.cancel(); return json({error: 'too large'}, 413, cors); }
        const next = new Uint8Array(bytes.length + value.length); next.set(bytes); next.set(value, bytes.length); bytes = next;
      }
      let body;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({error: 'invalid JSON'}, 400, cors); }
      let pages;
      try { pages = JSON.parse(env.PUBLIC_PAGES || '[]'); } catch { return json({error: 'page configuration invalid'}, 503, cors); }
      if (!Array.isArray(pages)) return json({error: 'page configuration invalid'}, 503, cors);
      const event = normalizeEvent(body, pages);
      if (!event) return json({error: 'invalid event'}, 400, cors);
      const counter = env.COUNTER.get(env.COUNTER.idFromName('site'));
      await counter.record(event);
      return json({accepted: true}, 202, cors);
    }

    if (url.pathname !== "/hit") {
      return new Response("AICQSOHOO! hit counter. POST /hit\n", {
        status: url.pathname === "/" ? 200 : 404,
        headers: { "Content-Type": "text/plain" },
      });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { ...cors, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Max-Age": "86400" },
      });
    }

    const counter = env.COUNTER.get(env.COUNTER.idFromName("site"));
    if (request.method === "POST") {
      // Only count hits sent by pages on the site itself.
      if (!cors["Access-Control-Allow-Origin"]) {
        return json({ error: "origin not allowed" }, 403, cors);
      }
      return json({ count: await counter.hit() }, 200, cors);
    }
    if (request.method === "GET") {
      return json({ count: await counter.current() }, 200, cors);
    }
    return json({ error: "method not allowed" }, 405, cors);
  },
};
