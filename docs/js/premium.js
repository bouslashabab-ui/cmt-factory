'use strict';
/* Samy Platform: live Cairo clock, ownership footer, count-up numbers, PWA registration, offline banner */
(function () {
  const COPY = '© ' + new Date().getFullYear() + ' Ahmed Samy - Designed & Programmed by Ahmed Samy';
  const fmtD = new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const fmtT = new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const fmtP = new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const fmtW = new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', weekday: 'long' });
  const fmtR = new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', year: 'numeric', month: 'long', day: 'numeric' });
  const setSlot = (slot, ch) => { if (slot.dataset.c === ch) return; const first = slot.dataset.c === undefined; slot.dataset.c = ch; slot.innerHTML = ''; const sp = document.createElement('span'); sp.className = first ? 'cv' : 'cv roll'; sp.textContent = ch; slot.append(sp); };
  const tick = () => {
    const n = new Date(); const ps = fmtP.formatToParts(n); const chars = []; let sec = false;
    ps.forEach(p => { if (p.type === 'literal') { chars.push({ c: ':', k: 'sep' }); } else if (p.type === 'dayPeriod') { chars.push({ c: ' ', k: 'sp' }); chars.push({ c: p.value, k: 'ap' }); } else { for (const ch of p.value) chars.push({ c: ch, k: p.type === 'second' ? 'sec' : 'dg' }); } });
    document.querySelectorAll('.sclock').forEach(e => {
      if (!e._ck || e._ck.n !== chars.length) { e.innerHTML = '<span class="ck-t"></span><span class="ck-d"><b class="ck-w"></b><span class="ck-r"></span></span><i class="ck-bar"></i>'; const t = e.querySelector('.ck-t'); chars.forEach(c => { const s = document.createElement('span'); s.className = 'ck-s ' + c.k; t.append(s); }); e._ck = { n: chars.length, t: [...t.children], w: e.querySelector('.ck-w'), r: e.querySelector('.ck-r'), bar: e.querySelector('.ck-bar') }; }
      chars.forEach((c, i) => setSlot(e._ck.t[i], c.c));
      const w = fmtW.format(n), r = fmtR.format(n); if (e._ck.w.textContent !== w) e._ck.w.textContent = w; if (e._ck.r.textContent !== r) e._ck.r.textContent = r;
      e._ck.bar.style.width = (n.getSeconds() * 1000 + n.getMilliseconds()) / 600 + '%';
    });
  };
  const ensure = () => {
    const land = document.querySelector('.land'); if (land && !land.querySelector('.sclock')) { const c = document.createElement('div'); c.className = 'sclock login-clock'; land.append(c); }
    const today = document.querySelector('.topbar .today'); if (today && !today.classList.contains('sclock')) { today.classList.add('sclock'); today.dataset.app = '1'; }
    const lf = document.querySelector('.land-f'); if (lf && !lf.querySelector('.copy')) { const s = document.createElement('span'); s.className = 'copy'; s.dir = 'ltr'; s.innerHTML = '<b>Samy Platform</b> &nbsp;|&nbsp; ' + COPY; lf.append(s); }
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
