'use strict';
/* Free, dependency-free exports: real .xlsx / .docx / .pptx files (ZIP + OOXML written here), CSV, print (A4) and PDF via the browser's Save as PDF. */
const EXP = (() => {
  const enc = new TextEncoder();
  const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const parts = [], cen = []; let off = 0;
    const u16 = (v) => [v & 255, (v >> 8) & 255], u32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
    files.forEach(f => {
      const nm = enc.encode(f.name), d = typeof f.data === 'string' ? enc.encode(f.data) : f.data, c = crc32(d);
      const lh = new Uint8Array([0x50, 0x4b, 3, 4, 20, 0, 0, 8, 0, 0, 0, 0x21, 0, 0x21, ...u32(c), ...u32(d.length), ...u32(d.length), ...u16(nm.length), 0, 0]);
      parts.push(lh, nm, d);
      cen.push(new Uint8Array([0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 8, 0, 0, 0, 0x21, 0, 0x21, ...u32(c), ...u32(d.length), ...u32(d.length), ...u16(nm.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(off)]), nm);
      off += lh.length + nm.length + d.length;
    });
    let cs = 0; cen.forEach(x => cs += x.length);
    const end = new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cs), ...u32(off), 0, 0]);
    const all = [...parts, ...cen, end]; let n = 0; all.forEach(x => n += x.length); const out = new Uint8Array(n); let p = 0; all.forEach(x => { out.set(x, p); p += x.length; }); return out;
  }
  const X = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colL = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const isNum = (v) => /^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$/.test(String(v).trim());
  const R = 'application/vnd.openxmlformats-officedocument.';
  const XH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  function xlsx(secs, company) {
    const names = secs.map((s, i) => (s.title || 'ورقة' + (i + 1)).replace(/[\\/?*\[\]:]/g, ' ').slice(0, 28) || 'ورقة' + (i + 1));
    const uniq = names.map((n, i) => names.indexOf(n) === i ? n : n.slice(0, 25) + '_' + (i + 1));
    const sheets = secs.map(s => {
      const all = [s.head, ...s.rows]; const widths = s.head.map((_, c) => Math.min(40, Math.max(8, ...all.map(r => String(r[c] ?? '').length + 2))));
      let rows = ''; all.forEach((r, ri) => { rows += '<row r="' + (ri + 1) + '">' + r.map((v, ci) => { const ref = colL(ci) + (ri + 1); v = v ?? ''; if (ri > 0 && v !== '' && isNum(v)) return '<c r="' + ref + '" s="2"><v>' + String(v).replace(/,/g, '').trim() + '</v></c>'; return '<c r="' + ref + '" t="inlineStr" s="' + (ri === 0 ? 1 : 3) + '"><is><t xml:space="preserve">' + X(v) + '</t></is></c>'; }).join('') + '</row>'; });
      return XH + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' + widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols><sheetData>' + rows + '</sheetData></worksheet>';
    });
    const styles = XH + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Tahoma"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF172B2A"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD5D8CC"/></left><right style="thin"><color rgb="FFD5D8CC"/></right><top style="thin"><color rgb="FFD5D8CC"/></top><bottom style="thin"><color rgb="FFD5D8CC"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf></cellXfs></styleSheet>';
    const files = [
      { name: '[Content_Types].xml', data: XH + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="' + R + 'spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="' + R + 'spreadsheetml.styles+xml"/>' + secs.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="' + R + 'spreadsheetml.worksheet+xml"/>').join('') + '</Types>' },
      { name: '_rels/.rels', data: XH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: XH + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView rightToLeft="1"/></bookViews><sheets>' + uniq.map((n, i) => '<sheet name="' + X(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: XH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + secs.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '<Relationship Id="rId' + (secs.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', data: styles }, ...sheets.map((s, i) => ({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: s }))];
    return zip(files);
  }
  function docx(secs, title, company) {
    const p = (t, o = {}) => '<w:p><w:pPr><w:bidi/>' + (o.c ? '<w:jc w:val="center"/>' : '') + '</w:pPr><w:r><w:rPr><w:rFonts w:ascii="Tahoma" w:hAnsi="Tahoma" w:cs="Tahoma"/>' + (o.b ? '<w:b/><w:bCs/>' : '') + '<w:rtl/><w:sz w:val="' + (o.sz || 22) + '"/><w:szCs w:val="' + (o.sz || 22) + '"/></w:rPr><w:t xml:space="preserve">' + X(t) + '</w:t></w:r></w:p>';
    const cell = (v, hd) => '<w:tc><w:tcPr>' + (hd ? '<w:shd w:val="clear" w:color="auto" w:fill="172B2A"/>' : '') + '</w:tcPr><w:p><w:pPr><w:bidi/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Tahoma" w:hAnsi="Tahoma" w:cs="Tahoma"/>' + (hd ? '<w:b/><w:color w:val="FFFFFF"/>' : '') + '<w:rtl/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">' + X(v) + '</w:t></w:r></w:p></w:tc>';
    let body = p(company || '', { b: 1, sz: 28, c: 1 }) + p(title, { b: 1, sz: 32, c: 1 }) + p(new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }), { c: 1 });
    secs.forEach(s => {
      if (s.title && s.title !== title) body += p(s.title, { b: 1, sz: 26 });
      body += '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:bidiVisual/><w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b => '<w:' + b + ' w:val="single" w:sz="4" w:color="999999"/>').join('') + '</w:tblBorders></w:tblPr><w:tblGrid>' + s.head.map(() => '<w:gridCol w:w="1500"/>').join('') + '</w:tblGrid><w:tr><w:trPr><w:tblHeader/></w:trPr>' + s.head.map(v => cell(v, 1)).join('') + '</w:tr>' + s.rows.map(r => '<w:tr>' + s.head.map((_, i) => cell(r[i] ?? '')).join('') + '</w:tr>').join('') + '</w:tbl>' + p('');
    });
    const doc = XH + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/><w:bidi/></w:sectPr></w:body></w:document>';
    return zip([{ name: '[Content_Types].xml', data: XH + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="' + R + 'wordprocessingml.document.main+xml"/></Types>' },
      { name: '_rels/.rels', data: XH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
      { name: 'word/document.xml', data: doc }]);
  }
  function pptx(secs, title, company) {
    const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
    const tx = (t, sz, b, col) => '<a:r><a:rPr lang="ar-EG" sz="' + sz + '"' + (b ? ' b="1"' : '') + '><a:solidFill><a:srgbClr val="' + (col || '172B2A') + '"/></a:solidFill><a:latin typeface="Tahoma"/><a:cs typeface="Tahoma"/></a:rPr><a:t>' + X(t) + '</a:t></a:r>';
    const box = (id, name, x, y, w, hh, t, sz, b, col) => '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="' + name + '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + w + '" cy="' + hh + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr wrap="square" rtlCol="1"/><a:lstStyle/><a:p><a:pPr algn="r" rtl="1"/>' + tx(t, sz, b, col) + '</a:p></p:txBody></p:sp>';
    const W = 12192000, H = 6858000, slides = [];
    const wrapSlide = (inner, bg) => XH + '<p:sld ' + NS + '><p:cSld>' + (bg ? '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="' + bg + '"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' : '') + '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' + inner + '</p:spTree></p:cSld></p:sld>';
    slides.push(wrapSlide(box(2, 'Title', 600000, 2200000, W - 1200000, 1100000, title, 4400, 1, 'C6F36A') + box(3, 'Sub', 600000, 3500000, W - 1200000, 600000, (company || '') + ' - ' + new Date().toLocaleDateString('ar-EG'), 2000, 0, 'FFFFFF'), '172B2A'));
    secs.forEach(s => {
      const per = 11; for (let i = 0; i < Math.max(1, s.rows.length); i += per) {
        const chunk = s.rows.slice(i, i + per), cols = Math.min(s.head.length, 9), cw = Math.floor((W - 800000) / cols), rh = 380000;
        const trs = [s.head.slice(0, cols), ...chunk.map(r => r.slice(0, cols))].map((r, ri) => '<a:tr h="' + rh + '">' + r.map(v => '<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="r" rtl="1"/>' + tx(v ?? '', 1000, ri === 0, ri === 0 ? 'FFFFFF' : '172B2A') + '</a:p></a:txBody><a:tcPr' + (ri === 0 ? '><a:solidFill><a:srgbClr val="172B2A"/></a:solidFill></a:tcPr>' : '/>') + '</a:tc>').join('') + '</a:tr>').join('');
        const gf = '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="Table"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="400000" y="1250000"/><a:ext cx="' + cw * cols + '" cy="' + rh * (chunk.length + 1) + '"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr rtl="1" firstRow="1"/><a:tblGrid>' + Array(cols).fill('<a:gridCol w="' + cw + '"/>').join('') + '</a:tblGrid>' + trs + '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>';
        slides.push(wrapSlide(box(2, 'Title', 400000, 300000, W - 800000, 800000, (s.title || title) + (s.rows.length > per ? ' (' + (Math.floor(i / per) + 1) + ')' : ''), 2800, 1) + gf));
      }
    });
    const n = slides.length, relNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', pkg = 'http://schemas.openxmlformats.org/package/2006/relationships';
    const files = [
      { name: '[Content_Types].xml', data: XH + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="' + R + 'presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="' + R + 'presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="' + R + 'presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="' + R + 'theme+xml"/>' + slides.map((_, i) => '<Override PartName="/ppt/slides/slide' + (i + 1) + '.xml" ContentType="' + R + 'presentationml.slide+xml"/>').join('') + '</Types>' },
      { name: '_rels/.rels', data: XH + '<Relationships xmlns="' + pkg + '"><Relationship Id="rId1" Type="' + relNS + '/officeDocument" Target="ppt/presentation.xml"/></Relationships>' },
      { name: 'ppt/presentation.xml', data: XH + '<p:presentation ' + NS + ' rtl="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>' + slides.map((_, i) => '<p:sldId id="' + (256 + i) + '" r:id="rId' + (i + 2) + '"/>').join('') + '</p:sldIdLst><p:sldSz cx="' + W + '" cy="' + H + '"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>' },
      { name: 'ppt/_rels/presentation.xml.rels', data: XH + '<Relationships xmlns="' + pkg + '"><Relationship Id="rId1" Type="' + relNS + '/slideMaster" Target="slideMasters/slideMaster1.xml"/>' + slides.map((_, i) => '<Relationship Id="rId' + (i + 2) + '" Type="' + relNS + '/slide" Target="slides/slide' + (i + 1) + '.xml"/>').join('') + '</Relationships>' },
      { name: 'ppt/slideMasters/slideMaster1.xml', data: XH + '<p:sldMaster ' + NS + '><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="F5F3EC"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>' },
      { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: XH + '<Relationships xmlns="' + pkg + '"><Relationship Id="rId1" Type="' + relNS + '/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="' + relNS + '/theme" Target="../theme/theme1.xml"/></Relationships>' },
      { name: 'ppt/slideLayouts/slideLayout1.xml', data: XH + '<p:sldLayout ' + NS + ' type="blank"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld></p:sldLayout>' },
      { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: XH + '<Relationships xmlns="' + pkg + '"><Relationship Id="rId1" Type="' + relNS + '/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>' },
      { name: 'ppt/theme/theme1.xml', data: XH + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="T"><a:themeElements><a:clrScheme name="c"><a:dk1><a:srgbClr val="172B2A"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="22403E"/></a:dk2><a:lt2><a:srgbClr val="F5F3EC"/></a:lt2><a:accent1><a:srgbClr val="397D73"/></a:accent1><a:accent2><a:srgbClr val="C6F36A"/></a:accent2><a:accent3><a:srgbClr val="E47B65"/></a:accent3><a:accent4><a:srgbClr val="84918A"/></a:accent4><a:accent5><a:srgbClr val="A9DC45"/></a:accent5><a:accent6><a:srgbClr val="2F7D4F"/></a:accent6><a:hlink><a:srgbClr val="397D73"/></a:hlink><a:folHlink><a:srgbClr val="84918A"/></a:folHlink></a:clrScheme><a:fontScheme name="f"><a:majorFont><a:latin typeface="Tahoma"/><a:ea typeface=""/><a:cs typeface="Tahoma"/></a:majorFont><a:minorFont><a:latin typeface="Tahoma"/><a:ea typeface=""/><a:cs typeface="Tahoma"/></a:minorFont></a:fontScheme><a:fmtScheme name="s"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>' },
      ...slides.map((s, i) => ({ name: 'ppt/slides/slide' + (i + 1) + '.xml', data: s })),
      ...slides.map((_, i) => ({ name: 'ppt/slides/_rels/slide' + (i + 1) + '.xml.rels', data: XH + '<Relationships xmlns="' + pkg + '"><Relationship Id="rId1" Type="' + relNS + '/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>' }))];
    return zip(files);
  }
  const csv = (secs) => '\ufeff' + secs.map(s => [s.head, ...s.rows].map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n')).join('\n\n');
  const save = (name, data, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; document.body.append(a); a.click(); a.remove(); };
  // scrape the tables and KPI cards of the visible screen
  function scrape(root) {
    const secs = []; const k = [...root.querySelectorAll('.kpi')].map(e => [e.querySelector('span')?.textContent.trim(), e.querySelector('b')?.textContent.trim()]).filter(x => x[0]);
    if (k.length) secs.push({ title: 'ملخص', head: ['البيان', 'القيمة'], rows: k });
    root.querySelectorAll('table.grid').forEach((t, i) => {
      const ths = [...t.querySelectorAll('thead th')]; const keep = ths.map((th, j) => th.textContent.trim() !== '' ? j : -1).filter(j => j >= 0);
      const rowsOf = (sel) => [...t.querySelectorAll(sel)].filter(tr => !tr.querySelector('td.empty')).map(tr => { const tds = [...tr.children]; return keep.map(j => (tds[j] ? tds[j].innerText.replace(/\s+/g, ' ').trim() : '')); });
      const ph = t.closest('.panel')?.querySelector('.ph'); secs.push({ title: ph ? ph.textContent.trim().slice(0, 28) : (secs.length ? 'جدول ' + (i + 1) : 'البيانات'), head: keep.map(j => ths[j].textContent.trim()), rows: [...rowsOf('tbody tr'), ...rowsOf('tfoot tr')] });
    });
    return secs;
  }
  return { zip, xlsx, docx, pptx, csv, save, scrape };
})();
