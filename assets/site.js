// Yavaya — the only script on the site. Everything works without it: it only
// remembers a theme choice and, on a first visit, follows the device language.
// Storage can throw (private mode, blocked site data), so every access is
// guarded and the page renders correctly either way.
(function () {
  var root = document.documentElement;

  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* not persisted */ }
  }

  var toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var current = root.getAttribute('data-theme');
      if (!current) {
        current = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      }
      var next = current === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      write('yavaya-theme', next);
    });
  }

  // An explicit language choice always wins over the device language.
  document.querySelectorAll('[data-lang-choice]').forEach(function (link) {
    link.addEventListener('click', function () {
      write('yavaya-lang', link.getAttribute('data-lang-choice'));
    });
  });

  // First visit only: an English-language device landing on a Spanish page is
  // offered the English page. Spanish stays the fallback for everything else.
  var chosen = read('yavaya-lang');
  // The switcher link is relative, so this also works on a preview host.
  var alt = document.querySelector('a[data-lang-choice="en"]');
  if (!chosen && root.lang === 'es' && alt) {
    var device = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    if (/^en\b/i.test(device)) {
      write('yavaya-lang', 'en');
      window.location.replace(alt.href);
    }
  }
})();
