// Referrer domain is derived locally. No full URL, query, ID or UA is sent.
(function () {
  if (document.documentElement?.dataset?.languageRedirect === 'pending') return;
  var config = document.getElementById('measurement');
  if (!config || !window.fetch) return;
  var page = config.getAttribute('data-page');
  var test = new URLSearchParams(location.search).get('measurement') === 'test';
  // Staging/localhost never writes production metrics or the legacy counter.
  if (!['aicqsohoo.com', 'www.aicqsohoo.com'].includes(location.hostname)) return;
  var source = 'unknown';
  try {
    if (document.referrer) {
      var ref = new URL(document.referrer);
      if (ref.protocol === 'https:' || ref.protocol === 'http:') {
        source = ['aicqsohoo.com', 'www.aicqsohoo.com'].includes(ref.hostname) ? 'internal' : ref.hostname;
      }
    }
  } catch (_) {}
  function send(event) {
    fetch(config.getAttribute('data-url'), {
      method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: {'Content-Type': 'application/json'}, keepalive: true,
      body: JSON.stringify({page: page, event: event, source: source, test: test})
    }).catch(function () {});
  }
  send('page_view');
  document.querySelectorAll('a[data-submission-intent]').forEach(function (a) {
    a.addEventListener('click', function () { send('submission_intent'); });
  });
})();
