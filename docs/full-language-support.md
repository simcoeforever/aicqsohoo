# Full Japanese and English pages

Every human page has an English URL (unchanged) and a `/ja/` equivalent,
including experiences, profiles, home, submission instructions and 404.
Each language has a self canonical and paired `en`, `ja`, `x-default` hreflang.
Static URLs have separate cache keys; there is no Accept-Language variation.
Machine JSON, schema, sitemap and llms.txt URLs and fields remain stable.

Initial selection: explicit `?lang=ja|en`, then explicit `/ja/` path,
then a saved manual preference, then the first supported browser language,
then English. Only `ja`/`en` is stored in localStorage; nothing is sent to
measurement. Explicit English navigation uses `?lang=en` to avoid a saved
Japanese preference overriding a deliberate switch. Unsupported values are ignored.
Switches preserve page identity, query context and anchors. Redirects replace the
current history entry, avoiding redirect back loops. A blocked storage API does
not break either explicit language. Without JavaScript, both static languages
and their ordinary links work; automatic selection requires JavaScript.

All human internal links stay in the page language except the language switch.
Language-neutral machine resources and external GitHub are labelled accordingly.
The GitHub Issue form is currently English; Japanese submission instructions
disclose this. English details no longer append a second Japanese summary.

Browser measurement and the old counter skip a page being automatically redirected.
The edge may record both successful GETs; these are events, not people. Both
languages map to the existing canonical measurement page categories, without
adding a language dimension or extra identifying data.

Checks: generated static link/locale coverage, source JSON compatibility,
deception warnings, counts, preference and URL priority, blocked storage,
query/hash preservation and redirect termination. Browser visual rendering
and real back-button interaction are not covered by the VM tests.
