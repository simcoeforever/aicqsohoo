// Pure validation and disclosure rules; never inspect request IP or User-Agent.
export const THRESHOLD = 10;
export function normalizeEvent(body, pages) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(k => !['page', 'event', 'source', 'test'].includes(k)) ||
      !pages.includes(body.page) || !['page_view', 'submission_intent'].includes(body.event) ||
      typeof body.test !== 'boolean') return null;
  let source = 'unknown';
  if (body.source === 'internal') source = 'internal';
  else if (body.source !== 'unknown') {
    // Accept only bare hostnames, never URLs, ports, credentials or paths.
    if (typeof body.source !== 'string' || body.source.length > 253 ||
        !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(body.source)) return null;
    source = body.source;
  }
  return { page: body.page, event: body.event, source, test: body.test };
}
export function weekRange(value, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const start = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(+start) || start.toISOString().slice(0, 10) !== value || start.getUTCDay() !== 1) return null;
  const end = new Date(+start + 7 * 86400000);
  const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z');
  if (end > today || start < new Date(+today - 84 * 86400000)) return null;
  return { start: value, end: end.toISOString().slice(0, 10) };
}
export function disclose(rows) {
  const bucket = n => n >= THRESHOLD ? Math.floor(n / 10) * 10 : null;
  const views = rows.filter(r => !r.test && r.event === 'page_view');
  const total = views.reduce((n, r) => n + r.n, 0);
  const sources = new Map();
  const pages = new Map();
  for (const r of views) sources.set(r.source, (sources.get(r.source) || 0) + r.n);
  for (const r of views) if (r.page) pages.set(r.page, (pages.get(r.page) || 0) + r.n);
  // No day/page/source cross-tabs and no residual small cells. Domains only,
  // without per-domain counts; unknown/internal are not external referrers.
  const domains = total >= THRESHOLD ? [...sources].filter(([s, n]) =>
    !['unknown', 'internal', 'other'].includes(s) && n >= THRESHOLD &&
    (total - n === 0 || total - n >= THRESHOLD)).map(([s]) => s).sort() : [];
  const intents = rows.filter(r => !r.test && r.event === 'submission_intent').reduce((n, r) => n + r.n, 0);
  return {
    page_views: bucket(total),
    page_views_status: total >= THRESHOLD ? 'released' : 'below_threshold',
    submission_intents: bucket(intents),
    resource_gets: bucket(rows.filter(r => !r.test && r.event === 'resource_get').reduce((n, r) => n + r.n, 0)),
    count_precision: 'ten_event_bucket',
    frequent_referrer_domains: domains,
    frequent_pages: total >= THRESHOLD ? [...pages].filter(([, n]) => n >= THRESHOLD &&
      (total - n === 0 || total - n >= THRESHOLD)).map(([p]) => p).sort() : [],
    threshold: THRESHOLD,
  };
}
