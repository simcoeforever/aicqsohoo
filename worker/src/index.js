// AICQSOHOO! hit counter: one Worker plus one SQLite-backed Durable Object.
//
// POST /hit  -> increments the counter and returns {"count": n}
// GET  /hit  -> returns the current count without incrementing
//
// Stores nothing but one integer. No cookies, no IPs, no user IDs, no logs of visitors.
import { DurableObject } from "cloudflare:workers";

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
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

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
