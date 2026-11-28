'use strict';
/* Demo shell (demo deployment only): banner, visible 20-minute session countdown,
   end-of-session lock screen, one-click fresh session. Loaded from index.html. */
(function () {
  const KEY = 'cmt_demo_end';
  let MIN = 20, endAt = 0, timer = null, locked = false;

  const css = `
#demoBar{position:fixed;top:0;right:0;left:0;height:38px;z-index:500;display:flex;align-items:center;gap:12px;
  padding:0 14px;background:linear-gradient(90deg,#122036,#1b2f52);color:#eef2ff;font-size:13px;
  border-bottom:2px solid #f5c542;box-shadow:0 2px 10px rgba(0,0,0,.3);font-family:inherit}
#demoBar .db-badge{background:#f5c542;color:#231a02;font-weight:800;padding:2px 12px;border-radius:99px;font-size:12.5px;flex:none}
#demoBar .db-txt{color:#c8d4f2;flex:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#demoBar .db-clock{margin-inline-start:auto;font-weight:800;font-size:15px;font-variant-numeric:tabular-nums;
  background:rgba(255,255,255,.1);padding:3px 12px;border-radius:8px;flex:none;direction:ltr}
#demoBar .db-clock.low{background:#b4232f;color:#fff;animation:dbBlink 1s step-start infinite}
@keyframes dbBlink{50%{opacity:.55}}
#demoBar .db-new{flex:none;border:1px solid #f5c542;background:none;color:#f5c542;border-radius:8px;
  padding:3px 10px;font-size:12px;cursor:pointer;font-family:inherit}
#demoBar .db-new:hover{background:#f5c542;color:#231a02}
.topnav{top:38px!important}
@media(min-width:901px){#app{padding-top:98px!important}}
@media(max-width:900px){#app{padding-top:38px!important}}
#demoLock{position:fixed;inset:0;z-index:99999;background:rgba(9,13,28,.94);display:flex;align-items:center;
  justify-content:center;padding:20px;direction:rtl}
#demoLock .dl-card{background:#fff;border-radius:20px;max-width:480px;width:100%;padding:36px 30px;text-align:center;
  box-shadow:0 24px 80px rgba(0,0,0,.5);border-top:6px solid #f5c542}
#demoLock .dl-ico{font-size:52px;line-height:1}
#demoLock h2{margin:14px 0 8px;font-size:24px;color:#122036}
#demoLock p{margin:0 0 8px;color:#4a5578;font-size:14.5px;line-height:1.8}
#demoLock .dl-note{font-size:12.5px;color:#8a93b5}
#demoLock .dl-go{margin-top:20px;background:#122036;color:#fff;border:0;border-radius:12px;padding:14px 22px;
  font-size:16px;font-weight:800;cursor:pointer;width:100%;font-family:inherit}
#demoLock .dl-go:hover{background:#1b2f52}
@media print{#demoBar{display:none!important}}
`;
  function injectCss() { const s = document.createElement('style'); s.id = 'demo-css'; s.textContent = css; document.head.append(s); }

  function fmtLeft(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function clearCreds() {
    try { sessionStorage.removeItem('cmt_tok'); } catch (e) { }
    try { ['cmt_tok', 'cmt_dev', 'cmt_dev_user'].forEach(k => localStorage.removeItem(k)); } catch (e) { }
  }
  function lock() {
    if (locked) return; locked = true;
    clearCreds();
    const old = document.getElementById('demoLock'); if (old) old.remove();
    const card = document.createElement('div'); card.className = 'dl-card';
    const ico = document.createElement('div'); ico.className = 'dl-ico'; ico.textContent = '⏱️';
    const t = document.createElement('h2'); t.textContent = 'انتهت الجلسة التجريبية';
    const p1 = document.createElement('p'); p1.textContent = 'شكرًا لتجربتك نظام إدارة مصنع الملابس. هذه نسخة عرض توضيحية وكل البيانات فيها وهمية.';
    const p2 = document.createElement('p'); p2.className = 'dl-note'; p2.textContent = 'مدة الجلسة التجريبية ' + MIN + ' دقيقة، وتُعاد تهيئة بيانات العرض تلقائيًا.';
    const go = document.createElement('button'); go.className = 'dl-go'; go.textContent = 'بدء جلسة تجريبية جديدة';
    go.onclick = async () => {
      go.disabled = true; go.textContent = 'جاري تجهيز بيانات العرض...';
      try { await fetch(((window.MZ_CONFIG || {}).api || '') + '/demo/reset', { method: 'POST' }); } catch (e) { }
      try { localStorage.removeItem(KEY); } catch (e) { }
      location.reload();
    };
    card.append(ico, t, p1, p2, go);
    const box = document.createElement('div'); box.id = 'demoLock'; box.append(card);
    document.body.append(box);
  }
  function tick() {
    const left = endAt - Date.now();
    const ck = document.querySelector('#demoBar .db-clock');
    if (ck) { ck.textContent = fmtLeft(left); ck.classList.toggle('low', left < 120000); }
    if (left <= 0) { clearInterval(timer); lock(); }
  }
  function build() {
    if (document.getElementById('demoBar')) return;
    injectCss();
    const bar = document.createElement('div'); bar.id = 'demoBar';
    const badge = document.createElement('span'); badge.className = 'db-badge'; badge.textContent = 'نسخة تجريبية';
    const txt = document.createElement('span'); txt.className = 'db-txt'; txt.textContent = 'بيانات وهمية للعرض فقط — الدخول: demo + كلمة المرور التجريبية';
    const nw = document.createElement('button'); nw.className = 'db-new'; nw.type = 'button'; nw.textContent = 'جلسة جديدة';
    nw.onclick = () => { if (!locked) { clearCreds(); try { localStorage.removeItem(KEY); } catch (e) { } location.reload(); } };
    const ck = document.createElement('span'); ck.className = 'db-clock'; ck.textContent = '--:--';
    bar.append(badge, txt, nw, ck);
    document.body.append(bar);
  }
  async function boot() {
    build();
    try {
      const r = await fetch(((window.MZ_CONFIG || {}).api || '') + '/demo/info');
      const j = await r.json(); if (j && j.minutes) MIN = Math.max(2, Math.min(120, +j.minutes || 20));
    } catch (e) { }
    const q = new URLSearchParams(location.search).get('demo_test_end');
    if (q && +q > 0) { endAt = Date.now() + Math.min(3600, +q) * 1000; }
    else {
      endAt = 0;
      try { endAt = +localStorage.getItem(KEY) || 0; } catch (e) { }
      if (!endAt || endAt - Date.now() > MIN * 60000 + 60000) {
        endAt = Date.now() + MIN * 60000;
        try { localStorage.setItem(KEY, String(endAt)); } catch (e) { }
      }
    }
    if (endAt <= Date.now()) { lock(); return; }
    tick();
    timer = setInterval(tick, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
