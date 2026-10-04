// Optional route in front of GitHub Pages. No DNS/route is configured by this file.
import { normalizeEvent } from './metrics.js';

export async function proxySite(request, env, ctx, forward = fetch) {
  ctx.passThroughOnException();
  const response = await forward(request);
  if (env.EDGE_ENABLED !== 'true' || request.method !== 'GET' ||
      !(response.ok || response.status === 304)) return response;
  const task = Promise.resolve().then(async () => {
    const url = new URL(request.url);
    let page = url.pathname.replace(/\/index\.html$/, '/');
    if (/^\/experiment\/[a-z0-9-]+\/$/.test(page)) page = '/experiment/';
    const pages = JSON.parse(env.PUBLIC_PAGES || '[]');
    const resources = ['/experiences.json', '/agents.json', '/submission-schema.json', '/llms.txt'];
    if (!Array.isArray(pages) || !pages.concat(resources).includes(page)) return;
    let source = 'unknown';
    try {
      const ref = new URL(request.headers.get('Referer'));
      if (['http:', 'https:'].includes(ref.protocol)) {
        source = ['aicqsohoo.com', 'www.aicqsohoo.com'].includes(ref.hostname) ? 'internal' : ref.hostname;
      }
    } catch (_) {}
    let event = normalizeEvent({page, source, event: 'page_view', test: url.searchParams.get('measurement') === 'test'}, pages.concat(resources));
    if (!event) event = {page, source: 'unknown', event: 'page_view', test: url.searchParams.get('measurement') === 'test'};
    event.event = 'resource_get';
    await env.COUNTER.get(env.COUNTER.idFromName('site')).record(event);
  }).catch(() => {}); // A metric failure must not replace a valid origin response.
  ctx.waitUntil(task);
  return response;
}
