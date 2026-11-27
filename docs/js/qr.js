'use strict';
/* Minimal QR Code encoder (byte mode, ECC level L, versions 1-10). No libraries. Window.QRS.matrix(text) / QRS.svg(text, size) */
window.QRS = (function () {
  const ECC = [7, 10, 15, 20, 26, 18, 20, 24, 30, 18], BLK = [1, 1, 1, 1, 1, 2, 2, 2, 2, 4];
  const rawModules = (v) => { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; };
  const mul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; };
  const divisor = (deg) => { const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1; for (let i = 0; i < deg; i++) { for (let j = 0; j < r.length; j++) { r[j] = mul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = mul(root, 2); } return r; };
  const remainder = (data, div) => { const r = div.map(() => 0); for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= mul(c, f); }); } return r; };
  function matrix(text) {
    const bytes = Array.from(new TextEncoder().encode(String(text)));
    let ver = 1; for (; ver <= 10; ver++) { const cap = Math.floor(rawModules(ver) / 8) - ECC[ver - 1] * BLK[ver - 1]; const cc = ver < 10 ? 8 : 16; if (4 + cc + bytes.length * 8 <= cap * 8) break; }
    if (ver > 10) throw new Error('QR text too long');
    const dataCap = Math.floor(rawModules(ver) / 8) - ECC[ver - 1] * BLK[ver - 1];
    let bits = []; const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
    put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
    put(0, Math.min(4, dataCap * 8 - bits.length)); while (bits.length % 8) bits.push(0);
    for (let p = 0xEC; bits.length < dataCap * 8; p ^= 0xEC ^ 0x11) put(p, 8);
    const data = []; for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }
    const nb = BLK[ver - 1], el = ECC[ver - 1], raw = Math.floor(rawModules(ver) / 8), ns = nb - raw % nb, sl = Math.floor(raw / nb), div = divisor(el);
    const blocks = []; for (let i = 0, k = 0; i < nb; i++) { const dl = sl - el + (i < ns ? 0 : 1); const dat = data.slice(k, k + dl); k += dl; const ec = remainder(dat, div); if (i < ns) dat.push(0); blocks.push(dat.concat(ec)); }
    const all = []; for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== sl - el || j >= ns) all.push(b[i]); });
    const size = ver * 4 + 17; const m = Array.from({ length: size }, () => new Array(size).fill(false)), fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, d) => { m[y][x] = !!d; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (x, y) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy; if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(xx, yy, d !== 2 && d !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    if (ver > 1) { const na = Math.floor(ver / 7) + 2, step = Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2; const pos = [6]; for (let p = size - 7; pos.length < na; p -= step) pos.splice(1, 0, p);
      for (let a = 0; a < na; a++) for (let b = 0; b < na; b++) { if ((a === 0 && b === 0) || (a === 0 && b === na - 1) || (a === na - 1 && b === 0)) continue; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(pos[a] + dx, pos[b] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); } }
    const fmt = (mask) => { const d = (1 << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); const bt = ((d << 10) | r) ^ 0x5412; const g = (i) => ((bt >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) set(8, i, g(i)); set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8)); for (let i = 9; i < 15; i++) set(14 - i, 8, g(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, g(i)); for (let i = 8; i < 15; i++) set(8, size - 15 + i, g(i)); set(8, size - 8, true); };
    fmt(0);
    if (ver >= 7) { let r = ver; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25); const bt = (ver << 12) | r; for (let i = 0; i < 18; i++) { const c = ((bt >>> i) & 1) !== 0, a = size - 11 + i % 3, b = Math.floor(i / 3); set(a, b, c); set(b, a, c); } }
    let i = 0; for (let right = size - 1; right >= 1; right -= 2) { if (right === 6) right = 5; for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) { const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert; if (!fn[y][x] && i < all.length * 8) { m[y][x] = ((all[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; } } }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && (x + y) % 2 === 0) m[y][x] = !m[y][x];
    return m;
  }
  function svg(text, px) { const m = matrix(text), n = m.length, q = 4; let d = ''; m.forEach((row, y) => row.forEach((c, x) => { if (c) d += 'M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z'; })); const s = px || 120; return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (n + 2 * q) + ' ' + (n + 2 * q) + '" width="' + s + '" height="' + s + '" shape-rendering="crispEdges" style="background:#fff"><path d="' + d + '" fill="#000"/></svg>'; }
  return { matrix, svg };
})();
