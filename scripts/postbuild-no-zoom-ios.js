const fs = require('fs');
const path = require('path');

const distIndex = path.join(process.cwd(), 'dist', 'index.html');
const viewport = 'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content';
const noZoomScript = `
  <script>
    (function () {
      var content = '${viewport}';
      function ensureViewport() {
        var meta = document.querySelector('meta[name="viewport"]');
        if (!meta) {
          meta = document.createElement('meta');
          meta.setAttribute('name', 'viewport');
          document.head.appendChild(meta);
        }
        meta.setAttribute('content', content);
      }
      function normalizeFocusedInput(event) {
        var el = event && event.target;
        if (!el || !el.matches) return;
        if (el.matches('input, textarea, select, [contenteditable="true"], [role="textbox"]')) {
          try {
            el.style.setProperty('font-size', '16px', 'important');
            el.style.setProperty('-webkit-text-size-adjust', '100%', 'important');
          } catch (e) {}
          setTimeout(function () {
            try { window.scrollTo(window.scrollX || 0, window.scrollY || 0); } catch (e) {}
          }, 60);
        }
      }
      ensureViewport();
      document.addEventListener('DOMContentLoaded', ensureViewport);
      document.addEventListener('focusin', normalizeFocusedInput, true);
      document.addEventListener('touchend', ensureViewport, true);
    })();
  </script>
`;

if (!fs.existsSync(distIndex)) {
  console.warn('[Movyo] dist/index.html não encontrado. Rode primeiro: npx expo export -p web');
  process.exit(0);
}

let html = fs.readFileSync(distIndex, 'utf8');
if (/<meta\s+name=["']viewport["'][^>]*>/i.test(html)) {
  html = html.replace(/<meta\s+name=["']viewport["'][^>]*>/i, `<meta name="viewport" content="${viewport}">`);
} else {
  html = html.replace(/<head[^>]*>/i, match => `${match}\n  <meta name="viewport" content="${viewport}">`);
}

if (!html.includes('normalizeFocusedInput')) {
  html = html.replace('</head>', `${noZoomScript}\n</head>`);
}

fs.writeFileSync(distIndex, html, 'utf8');
console.log('[Movyo] Correção anti-zoom iOS/PWA aplicada em dist/index.html');
