// This preference is not sent to analytics. Separate static URLs keep caches independent.
(() => {
  const key = 'aicqsohoo-language';
  const links = [...document.querySelectorAll('[data-language]')];
  const read = () => { try { return localStorage.getItem(key); } catch (_) { return null; } };
  const save = value => { try { localStorage.setItem(key, value); } catch (_) {} };
  const url = new URL(location.href);
  const explicit = url.searchParams.get('lang');
  const current = document.documentElement.lang;
  const valid = value => value === 'ja' || value === 'en';
  for (const link of links) {
    // Preserve deep-link anchors and test/query context across the switch.
    const target = new URL(link.href, location.href);
    target.search = url.search;
    target.searchParams.set('lang', link.dataset.language);
    target.hash = url.hash;
    link.href = target.href;
    link.addEventListener('click', () => save(link.dataset.language));
  }
  // Explicit URL language wins. /ja/ is always an explicit Japanese destination.
  // English links include ?lang=en, which also works when storage is unavailable.
  let wanted;
  if (valid(explicit)) { wanted = explicit; save(wanted); }
  else if (url.pathname.startsWith('/ja/')) wanted = 'ja';
  else {
    const stored = read();
    wanted = valid(stored) ? stored : ((navigator.languages || [navigator.language])
      .find(value => /^(ja|en)(-|$)/i.test(value || '')) || 'en').slice(0, 2).toLowerCase();
  }
  const target = links.find(link => link.dataset.language === wanted);
  if (wanted !== current && target) {
    document.documentElement.dataset.languageRedirect = 'pending';
    location.replace(target.href);
  }
})();
