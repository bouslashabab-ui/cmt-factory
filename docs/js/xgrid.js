'use strict';
/* XG: Excel-style editable grid — keyboard navigation (arrows/Tab/Enter), add/delete rows,
   TSV copy/paste, fill-down (Ctrl+D), live computed columns. */
window.XG = (function () {
  function create(opts) {
    // opts: {columns:[{key,title,type:'text'|'num'|'item'|'calc',width}], items:[{id,code,name,unit}], onChange}
    const cols = opts.columns;
    let rows = [blank()];
    const dl = h('datalist', { id: 'xgdl' + Math.random().toString(36).slice(2) });
    if (opts.items) dl.append(...opts.items.map(i => h('option', { value: i.code + ' — ' + i.name })));
    function blank() { const r = {}; cols.forEach(c => r[c.key] = c.type === 'num' ? '' : ''); return r; }
    function recalc(r) {
      const q = parseFloat(r.qty) || 0, p = parseFloat(r.price) || 0, d = parseFloat(r.disc) || 0;
      r.total = Math.round((q * p * (1 - d / 100) + Number.EPSILON) * 100) / 100;
    }
    const tbl = h('table', { class: 'xgt' });
    const tbody = h('tbody');
    tbl.append(h('thead', null, h('tr', null, h('th', { class: 'xgh-n' }, '#'), cols.map(c => h('th', { style: c.width ? 'width:' + c.width : '' }, c.title)), h('th', { class: 'xgh-x' }))), tbody, dl);
    const wrap = h('div', { class: 'xg' }, tbl);
    let fr = 0, fc = 0;

    function cellEl(r, c) { return tbody.children[r] && tbody.children[r].querySelectorAll('input')[c]; }
    function focus(r, c, sel) {
      r = Math.max(0, Math.min(rows.length - 1, r)); c = Math.max(0, Math.min(cols.length - 1, c));
      const el = cellEl(r, c); if (!el) return; fr = r; fc = c; el.focus(); if (sel !== false) el.select();
      tbody.querySelectorAll('td.on').forEach(td => td.classList.remove('on'));
      el.parentElement.classList.add('on');
    }
    function fillFromItem(r, m) {
      rows[r].item_id = m.id; rows[r]._unit = m.unit || '';
      if (!rows[r].description || !String(rows[r].description).trim()) rows[r].description = m.name;
      if (m.sell_price && !(parseFloat(rows[r].price) > 0)) rows[r].price = String(m.sell_price);
      recalc(rows[r]);
    }
    const qtyCol = () => { const i = cols.findIndex(x => x.key === 'qty'); return i < 0 ? 1 : i; };
    function commit(r, c) {
      if (!rows[r]) return;
      const el = cellEl(r, c); if (!el) return;
      const col = cols[c]; let v = el.value.trim();
      if (col.type === 'item' && opts.items) {
        const m = opts.items.find(i => (i.code + ' — ' + i.name) === v || i.code === v || i.name === v);
        if (m) { fillFromItem(r, m); render(); focus(r, qtyCol()); if (opts.onChange) opts.onChange(rows); return; }
        rows[r].item_id = null; rows[r]._unit = '';
      }
      if (col.type === 'num') v = v === '' ? '' : String(parseFloat(v) || 0);
      rows[r][col.key] = v; recalc(rows[r]);
      const tEl = tbody.children[r].querySelector('.xg-tot'); if (tEl) tEl.textContent = fmt(rows[r].total || 0);
      if (opts.onChange) opts.onChange(rows);
    }
    function addRow(after) { rows.splice(after == null ? rows.length : after + 1, 0, blank()); render(); }
    function delRow(r) { if (rows.length <= 1) { rows[0] = blank(); } else rows.splice(r, 1); render(); if (opts.onChange) opts.onChange(rows); }

    function render() {
      tbody.innerHTML = '';
      rows.forEach((r, ri) => {
        const tr = h('tr');
        tr.append(h('td', { class: 'xgh-n' }, String(ri + 1)));
        cols.forEach((c, ci) => {
          if (c.type === 'calc') { tr.append(h('td', { class: 'xg-tot num' }, fmt(r.total || 0))); return; }
          if (c.type === 'unit') { tr.append(h('td', { class: 'xg-unit' }, r._unit || '')); return; }
          const inp = h('input', { class: 'xgc' + (c.type === 'num' ? ' num' : ''), value: r[c.key] == null ? '' : String(c.type === 'item' && r.item_id && opts.items ? (() => { const m = opts.items.find(i => i.id === r.item_id); return m ? m.code + ' — ' + m.name : r[c.key]; })() : r[c.key]), inputmode: c.type === 'num' ? 'decimal' : 'text' });
          if (c.type === 'item') inp.setAttribute('list', dl.id);
          inp.addEventListener('focus', () => { fr = ri; fc = ci; tbody.querySelectorAll('td.on').forEach(td => td.classList.remove('on')); inp.parentElement.classList.add('on'); });
          if (c.type === 'item' && opts.items) inp.addEventListener('input', () => {
            const v = inp.value.trim();
            const m = opts.items.find(i => (i.code + ' — ' + i.name) === v || (v.length > 0 && i.code.toLowerCase() === v.toLowerCase()));
            if (m) { fillFromItem(ri, m); render(); focus(ri, qtyCol()); if (opts.onChange) opts.onChange(rows); }
          });
          inp.addEventListener('blur', () => commit(ri, ci));
          inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(ri, ci); if (ri === rows.length - 1) addRow(); focus(ri + 1, ci); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); commit(ri, ci); focus(ri + 1, ci, false); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); commit(ri, ci); focus(ri - 1, ci, false); }
            else if (e.key === 'ArrowLeft' && (inp.selectionStart === 0)) { e.preventDefault(); commit(ri, ci); focus(ri, ci - 1, false); }
            else if (e.key === 'ArrowRight' && (inp.selectionStart === inp.value.length)) { e.preventDefault(); commit(ri, ci); focus(ri, ci + 1, false); }
            else if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); if (ri > 0) { rows[ri][c.key] = rows[ri - 1][c.key]; if (c.key === 'item') rows[ri].item_id = rows[ri - 1].item_id; render(); focus(ri, ci, false); if (opts.onChange) opts.onChange(rows); } }
            else if (e.ctrlKey && e.key === 'Insert') { e.preventDefault(); addRow(ri); focus(ri + 1, ci); }
            else if (e.ctrlKey && e.key === 'Delete') { e.preventDefault(); delRow(ri); focus(Math.min(ri, rows.length - 1), ci); }
            else if (e.ctrlKey && e.key === 'c' && !window.getSelection().toString()) { e.preventDefault(); navigator.clipboard && navigator.clipboard.writeText(inp.value); toast('نُسخ', 'ok'); }
          });
          inp.addEventListener('paste', (e) => {
            const t = (e.clipboardData || window.clipboardData).getData('text');
            if (!/[\t\n]/.test(t)) return; // single value: native paste
            e.preventDefault(); commit(ri, ci);
            const lines = t.replace(/\r/g, '').split('\n').filter(x => x.length);
            lines.forEach((ln, dr) => {
              const rr = ri + dr; if (rr >= rows.length) addRow();
              ln.split('\t').forEach((val, dc) => {
                const cc = ci + dc; if (cc >= cols.length) return; const col = cols[cc];
                if (col.type === 'calc') return;
                if (col.type === 'item' && opts.items) { const m = opts.items.find(i => (i.code + ' — ' + i.name) === val.trim() || i.code === val.trim() || i.name === val.trim()); if (m) fillFromItem(rr, m); else { rows[rr].item_id = null; rows[rr][col.key] = val.trim(); } }
                else rows[rr][col.key] = col.type === 'num' ? String(parseFloat(val) || 0) : val.trim();
              });
              recalc(rows[rr]);
            });
            render(); focus(Math.min(ri + lines.length, rows.length - 1), ci, false); if (opts.onChange) opts.onChange(rows);
          });
          tr.append(h('td', null, inp));
        });
        tr.append(h('td', { class: 'xgh-x' }, h('button', { class: 'xg-del', title: 'حذف السطر (Ctrl+Delete)', onclick: () => { delRow(ri); } }, '×')));
        tbody.append(tr);
      });
    }
    render();
    return {
      el: wrap,
      rows: () => rows.filter(r => (r.description && String(r.description).trim()) || r.item_id || (parseFloat(r.qty) > 0)),
      addRow: () => { addRow(); focus(rows.length - 1, 0); },
      clear: () => { rows = [blank()]; render(); if (opts.onChange) opts.onChange(rows); },
      setRows: (rs) => { rows = rs.map(r => Object.assign(blank(), r)); rows.push(blank()); render(); if (opts.onChange) opts.onChange(rows); },
      setItems: (items) => { opts.items = items; dl.innerHTML = ''; dl.append(...items.map(i => h('option', { value: i.code + ' — ' + i.name }))); }
    };
  }
  return { create };
})();
