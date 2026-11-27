'use strict';
/* Samy Platform: live Cairo clock, ownership footer, count-up numbers, PWA registration, offline banner */
(function () {
  const COPY = '© ' + new Date().getFullYear() + ' Samy Platform - Designed & Programmed by Ahmed Samy';
  const fmtD = new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const fmtT = new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const tick = () => { const n = new Date(); const d = fmtD.format(n), t = fmtT.format(n); document.querySelectorAll('.sclock').forEach(e => { e.innerHTML = '<span class="ck-t">' + t + '</span><span class="ck-d">' + d + '</span>'; }); };
  const ensure = () => {
    const land = document.querySelector('.land'); if (land && !land.querySelector('.sclock')) { const c = document.createElement('div'); c.className = 'sclock login-clock'; land.append(c); }
    const today = document.querySelector('.topbar .today'); if (today && !today.classList.contains('sclock')) { today.classList.add('sclock'); today.dataset.app = '1'; }
    const lf = document.querySelector('.land-f'); if (lf && !lf.querySelector('.copy')) { const s = document.createElement('span'); s.className = 'copy'; s.dir = 'ltr'; s.textContent = COPY; lf.append(s); }
    const side = document.querySelector('.side'); if (side && !side.querySelector('.copy')) { const s = document.createElement('div'); s.className = 'copy side-copy'; s.dir = 'ltr'; s.textContent = COPY; side.append(s); }
    document.querySelectorAll('.kpi b:not([data-cu])').forEach(b => { b.dataset.cu = '1'; countUp(b); });
  };
  function countUp(el) {
    const txt = el.textContent.trim(); const m = txt.match(/^(-?)([\d,]+)(\.\d+)?$/); if (!m) return; const dec = m[3] ? m[3].length - 1 : 0; const target = parseFloat(txt.replace(/,/g, '')); if (!isFinite(target) || Math.abs(target) < 2) return;
    const t0 = performance.now(), dur = 700; const f = (n) => n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const step = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = f(target * e); if (p < 1) requestAnimationFrame(step); else el.textContent = txt; }; requestAnimationFrame(step);
  }
  new MutationObserver(ensure).observe(document.body, { childList: true, subtree: true });
  ensure(); tick(); setInterval(tick, 1000);
  const banner = document.createElement('div'); banner.className = 'offline-bar'; banner.textContent = 'لا يوجد اتصال بالإنترنت. يمكنك تصفح الشاشات المحفوظة، والحفظ يحتاج اتصالاً.'; document.body.append(banner);
  const net = () => banner.classList.toggle('on', !navigator.onLine); window.addEventListener('online', net); window.addEventListener('offline', net); net();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
