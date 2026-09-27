// AICQSOHOO! hit counter. Progressive enhancement: the page works without it.
// Sends one POST per homepage load. No cookies, no storage, no identifiers.
(function () {
  var el = document.getElementById("hits");
  if (!el || !window.fetch) return;
  var url = el.getAttribute("data-counter-url");
  var done = false;
  setTimeout(function () { done = true; }, 4000);
  fetch(url, { method: "POST", credentials: "omit", cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (done || !d || typeof d.count !== "number") return;
      var s = String(d.count);
      el.textContent = s.length >= 7 ? s : ("0000000" + s).slice(-7);
      el.parentNode.classList.add("live");
    })
    .catch(function () {});
})();
