(function () {
'use strict';
var $ = function (i) { return document.getElementById(i); };
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function norm(s) {
  return String(s == null ? '' : s).replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 1632; })
    .replace(/[۰-۹]/g, function (d) { return d.charCodeAt(0) - 1776; })
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').toLowerCase().trim();
}
function fmt(n) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
function r2(n) { return Math.round(n * 100) / 100; }
function dstr(t) { return new Date(t).toLocaleDateString('en-GB'); }
function tstr(t) { return new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
var toastT;
function toast(msg) {
  var t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3200);
}

/* ================= الموديلات (قاعدة البيانات) ================= */
var PKEY = 'ee.products.v1', IKEY = 'ee.invoices.v1';
var P = { items: [], at: null }, BYKEY = {}, facs = [];
function setProducts(items, at) {
  P.items = items; P.at = at; BYKEY = {}; facs = [];
  items.forEach(function (r) {
    r.k = norm(r.m); r.fk = norm(r.f); r.id = r.f + '|' + r.m; BYKEY[r.id] = r;
    if (facs.indexOf(r.f) < 0) facs.push(r.f);
  });
}
function plain(items) { return items.map(function (r) { return { f: r.f, m: r.m, p: r.p, s: r.s }; }); }
function loadProducts() {
  try {
    var s = JSON.parse(localStorage.getItem(PKEY) || 'null');
    if (s && Array.isArray(s.items)) { setProducts(plain(s.items), s.at || null); return; }
  } catch (e) {}
  setProducts([], null);
}
function saveProducts() {
  try { localStorage.setItem(PKEY, JSON.stringify({ items: plain(P.items), at: P.at })); return true; }
  catch (e) { toast('مقدرتش أحفظ الأسعار. مساحة التخزين ممتلة.'); return false; }
}

/* ================= الفواتير ================= */
var S = { invs: [], cur: null, next: 1, renum: false };
function uid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function newInv() {
  var inv = { id: uid(), no: S.next, cust: '', mode: 'sell', items: {}, dtype: 'amt', dval: 0, closed: false, at: null, snap: null };
  S.next++; S.invs.push(inv); S.cur = inv.id; return inv;
}
function cur() { for (var i = 0; i < S.invs.length; i++) if (S.invs[i].id === S.cur) return S.invs[i]; return null; }
function saveInv() {
  try { localStorage.setItem(IKEY, JSON.stringify(S)); return true; }
  catch (e) { toast('مقدرتش أحفظ الفاتورة. مساحة التخزين ممتلة.'); return false; }
}
function cleanInvs(src) {
  var out = { invs: [], cur: null, next: 1, renum: false };
  if (!src || !Array.isArray(src.invs)) return out;
  out.next = Math.max(1, parseInt(src.next, 10) || 1); out.renum = !!src.renum;
  src.invs.forEach(function (v) {
    var items = {};
    Object.keys(v.items || {}).forEach(function (k) { var q = parseInt(v.items[k], 10); if (q > 0) items[k] = q; });
    var closed = !!v.closed && v.snap && Array.isArray(v.snap.lines);
    out.invs.push({ id: String(v.id || uid()), no: parseInt(v.no, 10) || 0, cust: String(v.cust || ''), mode: v.mode === 'whole' ? 'whole' : 'sell',
      items: items, dtype: v.dtype === 'pct' ? 'pct' : 'amt', dval: Number(v.dval) || 0, closed: !!closed, at: v.at || null, snap: closed ? v.snap : null });
  });
  out.cur = src.cur;
  return out;
}
function pruneOpen() {
  S.invs.forEach(function (v) {
    if (v.closed) return;
    Object.keys(v.items).forEach(function (k) { if (!BYKEY[k]) delete v.items[k]; });
  });
}
function loadInv() {
  try { S = cleanInvs(JSON.parse(localStorage.getItem(IKEY) || 'null')); } catch (e) { S = cleanInvs(null); }
  pruneOpen();
  if (!S.invs.length) newInv();
  if (!cur()) S.cur = S.invs[S.invs.length - 1].id;
}
function price(inv, r) { return inv.mode === 'sell' ? r.s : r.p; }
function calc(inv) {
  if (inv.closed && inv.snap) return inv.snap;
  var g = 0, pcs = 0;
  Object.keys(inv.items).forEach(function (k) { var r = BYKEY[k]; if (!r) return; g += inv.items[k] * price(inv, r); pcs += inv.items[k]; });
  g = r2(g);
  var d = inv.dtype === 'pct' ? g * Math.min(100, Math.max(0, inv.dval)) / 100 : Math.max(0, inv.dval);
  d = r2(Math.min(g, d));
  return { gross: g, disc: d, net: r2(g - d), pcs: pcs };
}
function lines(inv) {
  if (inv.closed && inv.snap) return inv.snap.lines;
  var out = [];
  Object.keys(inv.items).forEach(function (k) { var r = BYKEY[k]; if (r) out.push({ f: r.f, m: r.m, q: inv.items[k], p: price(inv, r) }); });
  return out;
}
function openCur() { var c = cur(); if (!c || c.closed) c = newInv(); return c; }
function inCur(id) { var c = cur(); return (c && !c.closed && c.items[id]) || 0; }
function allFacs(ls) {
  var o = facs.slice();
  ls.forEach(function (l) { if (o.indexOf(l.f) < 0) o.push(l.f); });
  return o;
}

/* ================= واجهة الموديلات ================= */
var factory = '', view = 'm', invSub = 'cur', histScope = 'today';
function hl(text, q) {
  var n = norm(text), i = q ? n.indexOf(q) : -1;
  if (i < 0 || n.length !== String(text).length) return esc(text);
  return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
}
function stepper(id, q) {
  return '<div class="stepper"><button class="st" type="button" data-dec="' + esc(id) + '" aria-label="نقص">&minus;</button>' +
    '<input class="qty" type="number" inputmode="numeric" min="0" value="' + q + '" data-qty="' + esc(id) + '" aria-label="الكمية">' +
    '<button class="st" type="button" data-inc="' + esc(id) + '" aria-label="زيادة">+</button></div>';
}
function actHtml(r) {
  var q = inCur(r.id);
  if (!q) return '<button class="add" type="button" data-add="' + esc(r.id) + '">+ أضف للفاتورة</button>';
  return '<span class="lbl">في الفاتورة</span>' + stepper(r.id, q);
}
function renderModels() {
  var q = norm($('q').value);
  $('clr').hidden = !q;
  var c = cur();
  $('which').textContent = c && !c.closed ? ('بتضيف على فاتورة ' + c.no) : 'الأسعار بالجنيه';
  if (!P.items.length) {
    $('count').textContent = '';
    $('list').innerHTML = '<li class="emptybox"><b>مفيش موديلات لسه</b><span>ارفع ملف الإكسل من الإعدادات عشان تبدأ.</span><button class="btn" type="button" data-goset="1">روح للإعدادات</button></li>';
    return;
  }
  var res = P.items.filter(function (r) {
    if (factory && r.f !== factory) return false;
    return !q || r.k.indexOf(q) > -1 || r.fk.indexOf(q) > -1;
  });
  if (q) {
    var rank = function (r) { return r.k === q ? 0 : r.k.indexOf(q) === 0 ? 1 : r.k.indexOf(q) > -1 ? 2 : 3; };
    res.sort(function (a, b) { return rank(a) - rank(b); });
  }
  $('count').textContent = q || factory ? (res.length + ' نتيجة') : ('كل الموديلات (' + P.items.length + ')');
  if (!res.length) { $('list').innerHTML = '<li class="empty">مفيش موديل بالرقم ده. راجع الرقم وجرب تاني.</li>'; return; }
  $('list').innerHTML = res.slice(0, 100).map(function (r) {
    return '<li class="card' + (inCur(r.id) ? ' in' : '') + '" data-id="' + esc(r.id) + '"><div class="top"><div class="model">' + hl(r.m, q) + '</div><div class="factory">' + hl(r.f, q) + '</div></div>' +
      '<div class="prices"><div class="tile whole"><span>سعر الجملة</span><b>' + fmt(r.p) + '</b></div>' +
      '<div class="tile sell"><span>سعر البيع</span><b>' + fmt(r.s) + '</b></div></div>' +
      '<div class="act">' + actHtml(r) + '</div></li>';
  }).join('') + (res.length > 100 ? '<li class="empty">اكتب أكتر لتضييق النتائج</li>' : '');
}
function facCount(f) {
  var c = cur(), n = 0;
  if (c && !c.closed) Object.keys(c.items).forEach(function (k) { if (BYKEY[k] && BYKEY[k].f === f) n += c.items[k]; });
  return n;
}
function renderChips() {
  var h = '<button class="chip" aria-pressed="' + (factory === '') + '" data-f="">الكل</button>';
  facs.forEach(function (f) {
    var c = facCount(f);
    h += '<button class="chip" aria-pressed="' + (factory === f) + '" data-f="' + esc(f) + '">' + esc(f) + (c ? '<span class="badge">' + c + '</span>' : '') + '</button>';
  });
  $('chips').innerHTML = P.items.length ? h : '';
}
function renderTabs() {
  var c = cur(); if (!c) return;
  var t = calc(c);
  $('tcount').textContent = t.pcs;
  $('ttotal').textContent = c.closed ? ('فاتورة ' + c.no + ' مقفولة') : (t.pcs ? ('فاتورة ' + c.no + ': ' + fmt(t.net)) : ('فاتورة ' + c.no));
}

/* ================= واجهة الفواتير ================= */
function renderBar() {
  var h = '', c = cur();
  S.invs.forEach(function (v) {
    if (v.closed && v.id !== S.cur) return;
    h += '<button class="chip" type="button" data-sel="' + v.id + '" aria-pressed="' + (v.id === S.cur) + '">فاتورة ' + v.no + (v.closed ? '<span class="ok">مقفولة</span>' : '') + '</button>';
  });
  h += '<button class="chip new" type="button" id="newinv">+ فاتورة جديدة</button>';
  $('invbar').innerHTML = h;
}
function groupsHtml(inv, ro) {
  var ls = lines(inv), h = '';
  allFacs(ls).forEach(function (f) {
    var items = ls.filter(function (l) { return l.f === f; });
    if (!items.length) return;
    var sub = 0, pcs = 0;
    var body = items.map(function (l) {
      sub += l.q * l.p; pcs += l.q; var id = l.f + '|' + l.m;
      if (ro) return '<div class="ro"><div><div class="m">' + esc(l.m) + '</div><div class="x">' + l.q + ' × ' + fmt(l.p) + '</div></div><b>' + fmt(r2(l.q * l.p)) + '</b></div>';
      return '<div class="line"><div><div class="m">' + esc(l.m) + '</div><div class="u">' + fmt(l.p) + ' للقطعة</div></div><div class="t">' + fmt(r2(l.q * l.p)) + '</div>' +
        '<div style="grid-column:1/-1">' + stepper(id, l.q) + '</div></div>';
    }).join('');
    h += '<div class="grp"><div class="gh"><h2>' + esc(f) + '</h2>' + (ro ? '' : '<button class="more" type="button" data-more="' + esc(f) + '">+ موديلات أكتر</button>') + '</div>' + body +
      '<div class="sub"><span>' + pcs + ' قطعة</span><span>' + fmt(r2(sub)) + '</span></div></div>';
  });
  return h;
}
function renderInv() {
  renderBar();
  var c = cur(), t = calc(c), closedN = 0, closedSum = 0;
  S.invs.forEach(function (v) { if (v.closed && v.snap) { closedN++; closedSum += v.snap.net; } });
  $('tools').hidden = c.closed;
  if (!c.closed) {
    $('cust').value = c.cust;
    document.querySelectorAll('.seg button').forEach(function (x) { x.setAttribute('aria-pressed', x.dataset.mode === c.mode); });
  }
  var h = '';
  if (c.closed) h += '<div class="closedtag">مقفولة ' + dstr(c.at) + ' ' + tstr(c.at) + (c.cust ? ' - ' + esc(c.cust) : '') + '</div>';
  if (!t.pcs) {
    h += '<div class="empty">الفاتورة فاضية.<br>ارجع للموديلات واضغط "أضف للفاتورة".</div>';
  } else {
    h += groupsHtml(c, c.closed);
    h += '<div class="sumbox"><div class="srow"><span>الإجمالي (' + t.pcs + ' قطعة)</span><b id="t-gross">' + fmt(t.gross) + '</b></div>';
    if (c.closed) {
      h += '<div class="srow"><span>الخصم' + (c.dtype === 'pct' ? ' (' + fmt(c.dval) + '%)' : '') + '</span><b id="t-disc">' + fmt(t.disc) + '</b></div>';
    } else {
      h += '<div class="drow"><label for="dval">الخصم</label><input id="dval" type="number" inputmode="decimal" min="0" step="any" value="' + (c.dval || '') + '" placeholder="0">' +
        '<div class="dseg" role="group" aria-label="نوع الخصم"><button type="button" data-dt="amt" aria-pressed="' + (c.dtype === 'amt') + '">جنيه</button><button type="button" data-dt="pct" aria-pressed="' + (c.dtype === 'pct') + '">%</button></div></div>' +
        '<div class="srow"><span>قيمة الخصم</span><b id="t-disc">' + fmt(t.disc) + '</b></div>';
    }
    h += '</div><div class="total net"><span>صافي الفاتورة</span><b id="t-net">' + fmt(t.net) + '</b></div>';
    h += '<div class="btns">' + (c.closed ? '<button class="btn" id="copy" type="button">نسخ</button><button class="btn" id="share" type="button">مشاركة</button>' :
      '<button class="btn primary" id="close" type="button">إقفال الفاتورة</button><button class="btn" id="copy" type="button">نسخ</button>') + '</div>';
    h += '<div class="btns"><button class="btn sec" id="print" type="button">طباعة / PDF</button>' + (c.closed ? '<button class="btn sec" id="reopen" type="button">إعادة فتح</button>' : '<button class="btn sec" id="share" type="button">مشاركة</button>') + '</div>';
  }
  h += '<div class="btns"><button class="btn sec" id="del" type="button">حذف الفاتورة ' + c.no + '</button></div>';
  h += '<label class="opt"><input type="checkbox" id="renum"' + (S.renum ? ' checked' : '') + '><span>ترقيم الفواتير يرجع من 1 بعد الحذف<small>مثال: لو مسحت فاتورة 2 من 3، فاتورة 3 تبقى رقم 2.</small></span></label>';
  h += '<div class="note" id="msg" aria-live="polite">' + (closedN ? ('الفواتير المقفولة: ' + closedN + ' - مجموع صافيها ' + fmt(r2(closedSum)) + '. ') : '') + 'الفواتير بتتحفظ على الجهاز ده.</div>';
  $('inv').innerHTML = h;
}
function renderHist() {
  var q = norm($('hq').value), today = dstr(Date.now());
  var list = S.invs.filter(function (v) { return v.closed && v.snap; });
  if (histScope === 'today') list = list.filter(function (v) { return dstr(v.at) === today; });
  if (q) list = list.filter(function (v) { return String(v.no) === q || norm(v.cust).indexOf(q) > -1; });
  list.sort(function (a, b) { return b.at - a.at; });
  if (!list.length) { $('hist').innerHTML = '<div class="empty">' + (histScope === 'today' ? 'مفيش فواتير مقفولة النهارده.' : 'مفيش فواتير مقفولة.') + '</div>'; return; }
  var days = [], map = {};
  list.forEach(function (v) { var k = dstr(v.at); if (!map[k]) { map[k] = { k: k, items: [], sum: 0 }; days.push(map[k]); } map[k].items.push(v); map[k].sum += v.snap.net; });
  var all = 0; list.forEach(function (v) { all += v.snap.net; });
  var h = '<div class="note">' + list.length + ' فاتورة - مجموع الصافي ' + fmt(r2(all)) + '</div>';
  days.forEach(function (d) {
    h += '<div class="dayh"><span>' + d.k + '</span><small>' + d.items.length + ' فاتورة - ' + fmt(r2(d.sum)) + '</small></div>';
    d.items.forEach(function (v) {
      h += '<button class="hrow" type="button" data-open="' + v.id + '"><span><span class="n">فاتورة ' + v.no + '</span><br><span class="c">' + esc(v.cust || 'بدون اسم') + ' - ' + tstr(v.at) + ' - ' + v.snap.pcs + ' قطعة</span></span><b>' + fmt(v.snap.net) + '</b></button>';
    });
  });
  $('hist').innerHTML = h;
}
function updateTotals() {
  var c = cur(); if (!c || c.closed) return; var t = calc(c);
  if ($('t-gross')) { $('t-gross').textContent = fmt(t.gross); $('t-disc').textContent = fmt(t.disc); $('t-net').textContent = fmt(t.net); }
  renderTabs();
}
function invText(c) {
  var t = calc(c), out = ['فاتورة رقم ' + c.no + ' - ابن عز لملابس الأطفال'];
  if (c.cust) out.push('العميل: ' + c.cust);
  out.push('التاريخ: ' + dstr(c.at || Date.now()));
  out.push('السعر: ' + (c.mode === 'sell' ? 'سعر البيع' : 'سعر الجملة'));
  var ls = lines(c);
  allFacs(ls).forEach(function (f) {
    var items = ls.filter(function (l) { return l.f === f; }); if (!items.length) return;
    out.push('', '*' + f + '*'); var sub = 0;
    items.forEach(function (l) { sub += l.q * l.p; out.push(l.m + ' × ' + l.q + ' × ' + fmt(l.p) + ' = ' + fmt(r2(l.q * l.p))); });
    out.push('إجمالي ' + f + ': ' + fmt(r2(sub)));
  });
  out.push('', 'الإجمالي: ' + fmt(t.gross) + ' (' + t.pcs + ' قطعة)');
  if (t.disc) out.push('الخصم' + (c.dtype === 'pct' ? ' (' + fmt(c.dval) + '%)' : '') + ': ' + fmt(t.disc));
  out.push('الصافي: ' + fmt(t.net));
  return out.join('\n');
}
function printInv(c) {
  var t = calc(c), ls = lines(c), rows = '';
  allFacs(ls).forEach(function (f) {
    var items = ls.filter(function (l) { return l.f === f; }); if (!items.length) return;
    rows += '<tr class="fh"><td colspan="4">' + esc(f) + '</td></tr>';
    items.forEach(function (l) { rows += '<tr><td>' + esc(l.m) + '</td><td>' + l.q + '</td><td>' + fmt(l.p) + '</td><td>' + fmt(r2(l.q * l.p)) + '</td></tr>'; });
  });
  var foot = '<tr class="tot"><td colspan="3">الإجمالي (' + t.pcs + ' قطعة)</td><td>' + fmt(t.gross) + '</td></tr>';
  if (t.disc) foot += '<tr class="tot"><td colspan="3">الخصم' + (c.dtype === 'pct' ? ' (' + fmt(c.dval) + '%)' : '') + '</td><td>' + fmt(t.disc) + '</td></tr>';
  foot += '<tr class="tot"><td colspan="3">صافي الفاتورة</td><td>' + fmt(t.net) + '</td></tr>';
  $('printarea').innerHTML = '<div class="ph"><img src="logo.png" alt=""><div><h1>ابن عز لملابس الأطفال</h1><div>فاتورة رقم ' + c.no + ' - ' + dstr(c.at || Date.now()) + '</div>' + (c.cust ? '<div>العميل: ' + esc(c.cust) + '</div>' : '') + '</div></div>' +
    '<table><thead><tr><th>الموديل</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>' + rows + foot + '</tbody></table>';
  window.print();
}
function setQty(id, q) {
  q = Math.max(0, Math.min(9999, parseInt(q, 10) || 0));
  if (!BYKEY[id]) return;
  var c = openCur();
  if (q) c.items[id] = q; else delete c.items[id];
  saveInv(); renderTabs(); renderChips();
  if (view === 'm') {
    var card = document.querySelector('.card[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
    if (card) { card.classList.toggle('in', !!q); card.querySelector('.act').innerHTML = actHtml(BYKEY[id]); }
    $('which').textContent = 'بتضيف على فاتورة ' + c.no;
  } else renderInv();
}

/* ================= الإعدادات: استيراد إكسل ================= */
async function inflate(u8) {
  var ds = new DecompressionStream('deflate-raw');
  var stream = new Blob([u8]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
function zipOpen(buf) {
  var dv = new DataView(buf), u8 = new Uint8Array(buf), i = buf.byteLength - 22;
  for (; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) break;
  if (i < 0) throw new Error('الملف مش إكسل صحيح. اتأكد إنه بصيغة xlsx.');
  var n = dv.getUint16(i + 10, true), off = dv.getUint32(i + 16, true), map = {};
  for (var k = 0; k < n; k++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    var method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true);
    var nl = dv.getUint16(off + 28, true), el = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true), lh = dv.getUint32(off + 42, true);
    map[new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nl))] = { method: method, csize: csize, lh: lh };
    off += 46 + nl + el + cl;
  }
  return { map: map, dv: dv, u8: u8 };
}
async function zipText(z, name) {
  var e = z.map[name]; if (!e) return null;
  var start = e.lh + 30 + z.dv.getUint16(e.lh + 26, true) + z.dv.getUint16(e.lh + 28, true);
  var data = z.u8.subarray(start, start + e.csize);
  return new TextDecoder('utf-8').decode(e.method === 0 ? data : await inflate(data));
}
function xml(s) { return new DOMParser().parseFromString(s, 'application/xml'); }
function colIdx(ref) { var m = /^[A-Z]+/.exec(ref)[0], n = 0; for (var i = 0; i < m.length; i++) n = n * 26 + m.charCodeAt(i) - 64; return n - 1; }
async function readXlsx(buf) {
  var z = zipOpen(buf);
  var sheetPath = 'xl/worksheets/sheet1.xml';
  try {
    var wb = await zipText(z, 'xl/workbook.xml'), rels = await zipText(z, 'xl/_rels/workbook.xml.rels');
    if (wb && rels) {
      var sh = xml(wb).getElementsByTagName('sheet')[0];
      var rid = sh && (sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || sh.getAttribute('r:id'));
      var rs = xml(rels).getElementsByTagName('Relationship');
      for (var i = 0; i < rs.length; i++) if (rs[i].getAttribute('Id') === rid) {
        var tg = rs[i].getAttribute('Target'); sheetPath = tg.charAt(0) === '/' ? tg.slice(1) : 'xl/' + tg;
      }
    }
  } catch (e) {}
  var sheetXml = await zipText(z, sheetPath);
  if (!sheetXml) throw new Error('مش لاقي شيت جوه الملف.');
  var shared = [], ss = await zipText(z, 'xl/sharedStrings.xml');
  if (ss) {
    var sis = xml(ss).getElementsByTagName('si');
    for (var a = 0; a < sis.length; a++) {
      var ts = sis[a].getElementsByTagName('t'), txt = '';
      for (var b = 0; b < ts.length; b++) if (ts[b].parentNode.nodeName !== 'rPh') txt += ts[b].textContent;
      shared.push(txt);
    }
  }
  var rowsEl = xml(sheetXml).getElementsByTagName('row'), rows = [];
  for (var r = 0; r < rowsEl.length; r++) {
    var cells = rowsEl[r].getElementsByTagName('c'), arr = [], rn = parseInt(rowsEl[r].getAttribute('r'), 10);
    for (var c = 0; c < cells.length; c++) {
      var cell = cells[c], ref = cell.getAttribute('r'), t = cell.getAttribute('t'), vEl = cell.getElementsByTagName('v')[0], val = null;
      if (t === 'inlineStr') { var is = cell.getElementsByTagName('t'); val = ''; for (var d = 0; d < is.length; d++) val += is[d].textContent; }
      else if (vEl) {
        var raw = vEl.textContent;
        if (t === 's') val = shared[parseInt(raw, 10)]; else if (t === 'str') val = raw; else if (t === 'b') val = raw === '1'; else if (t === 'e') val = null;
        else { var num = parseFloat(raw); val = isNaN(num) ? null : num; }
      }
      arr[ref ? colIdx(ref) : arr.length] = val;
    }
    rows[(rn || r + 1) - 1] = arr;
  }
  for (var x = 0; x < rows.length; x++) if (!rows[x]) rows[x] = [];
  return rows;
}
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  var rows = [], row = [], cell = '', q = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',' || ch === ';' || ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function toNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (v == null) return null;
  var n = parseFloat(String(v).replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 1632; }).replace(/[,\s]/g, ''));
  return isNaN(n) ? null : n;
}
function cleanModel(v) {
  if (typeof v === 'number') return String(v);
  return String(v == null ? '' : v).trim().replace(/\.0+$/, '');
}
function parseProducts(rows) {
  var hi = -1, cols = {};
  for (var i = 0; i < Math.min(rows.length, 15) && hi < 0; i++) {
    var m = {};
    (rows[i] || []).forEach(function (v, j) {
      var t = norm(v);
      if (!t) return;
      if (t.indexOf('مصنع') > -1) m.f = j;
      else if (t.indexOf('رقم') > -1 && t.indexOf('موديل') > -1) m.m = j;
      else if (t.indexOf('جمل') > -1) m.p = j;
      else if (t.indexOf('بيع') > -1) m.s = j;
    });
    if (m.f != null && m.m != null) { hi = i; cols = m; }
  }
  if (hi < 0) throw new Error('مش لاقي صف العناوين. لازم يكون فيه "المصنع" و"رقم الموديل".');
  var miss = [];
  if (cols.p == null) miss.push('سعر الجملة'); if (cols.s == null) miss.push('سعر البيع');
  if (miss.length) throw new Error('ناقص عمود: ' + miss.join(' و'));
  var seen = {}, items = [], skipped = [], dups = 0;
  for (var r = hi + 1; r < rows.length; r++) {
    var row = rows[r] || [];
    if (row.every(function (v) { return v == null || String(v).trim() === ''; })) continue;
    var f = String(row[cols.f] == null ? '' : row[cols.f]).replace(/\s+/g, ' ').trim(), mo = cleanModel(row[cols.m]);
    var p = toNum(row[cols.p]), s = toNum(row[cols.s]);
    if (!f || !mo || p == null || s == null) { skipped.push(r + 1); continue; }
    var key = f + '|' + mo;
    if (seen[key] != null) { dups++; items[seen[key]] = { f: f, m: mo, p: p, s: s }; continue; }
    seen[key] = items.length; items.push({ f: f, m: mo, p: p, s: s });
  }
  if (!items.length) throw new Error('مفيش صفوف صالحة في الملف.');
  return { items: items, skipped: skipped, dups: dups };
}
var pending = null;
function diffProducts(items) {
  var old = {}; P.items.forEach(function (r) { old[r.id] = r; });
  var nw = {}; items.forEach(function (r) { nw[r.f + '|' + r.m] = r; });
  var added = [], removed = [], changed = [];
  items.forEach(function (r) { var o = old[r.f + '|' + r.m]; if (!o) added.push(r); else if (o.p !== r.p || o.s !== r.s) changed.push({ r: r, o: o }); });
  P.items.forEach(function (r) { if (!nw[r.id]) removed.push(r); });
  return { added: added, removed: removed, changed: changed };
}
function showPreview(res) {
  var d = diffProducts(res.items);
  pending = res.items;
  var h = '<div class="pv"><b>' + res.items.length + ' موديل في الملف</b>';
  h += '<div>جديد: ' + d.added.length + ' - اتحذف: ' + d.removed.length + ' - سعره اتغير: ' + d.changed.length + '</div>';
  function ul(arr, fn) { return arr.length ? '<ul>' + arr.slice(0, 6).map(function (x) { return '<li>' + fn(x) + '</li>'; }).join('') + (arr.length > 6 ? '<li>و ' + (arr.length - 6) + ' كمان</li>' : '') + '</ul>' : ''; }
  h += ul(d.added, function (r) { return 'جديد: ' + esc(r.f) + ' ' + esc(r.m); });
  h += ul(d.changed, function (x) { return 'اتغير: ' + esc(x.r.f) + ' ' + esc(x.r.m) + ' (بيع ' + fmt(x.o.s) + ' ← ' + fmt(x.r.s) + ')'; });
  h += ul(d.removed, function (r) { return 'اتحذف: ' + esc(r.f) + ' ' + esc(r.m); });
  if (res.skipped.length) h += '<div class="err">اتجاهلت ' + res.skipped.length + ' صف ناقص بياناته (أول صفوف: ' + res.skipped.slice(0, 5).join('، ') + ')</div>';
  if (res.dups) h += '<div>' + res.dups + ' موديل مكرر، واتاخد آخر واحد.</div>';
  if (P.items.length && d.removed.length > P.items.length / 2) h += '<div class="err">تنبيه: هيتشال أكتر من نص الموديلات. اتأكد إن ده الملف الصح.</div>';
  h += '<div class="btns"><button class="btn" id="applyimp" type="button">تطبيق التحديث</button><button class="btn sec" id="cancelimp" type="button">إلغاء</button></div></div>';
  $('imp').innerHTML = h;
}
async function handleImport(file) {
  $('imp').innerHTML = '<div class="pv">بقرا الملف...</div>';
  try {
    var rows;
    if (/\.csv$/i.test(file.name)) rows = parseCSV(await file.text());
    else rows = await readXlsx(await file.arrayBuffer());
    showPreview(parseProducts(rows));
  } catch (e) { pending = null; $('imp').innerHTML = '<div class="pv"><span class="err">' + esc(e.message || 'مقدرتش أقرا الملف.') + '</span></div>'; }
}
function applyImport() {
  if (!pending) return;
  var prevItems = P.items, prevAt = P.at;
  setProducts(pending.map(function (r) { return { f: r.f, m: r.m, p: r.p, s: r.s }; }), Date.now());
  if (!saveProducts()) { setProducts(prevItems, prevAt); return; }
  pending = null; pruneOpen(); saveInv();
  if (factory && facs.indexOf(factory) < 0) factory = '';
  $('imp').innerHTML = ''; renderSettings(); renderChips(); renderTabs();
  toast('اتحدّثت الأسعار: ' + P.items.length + ' موديل.');
}
function dl(name, text, mime) {
  var b = new Blob([text], { type: mime }), a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function exportCSV() {
  var q = function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  var rows = [['رقم الفاتورة', 'التاريخ', 'الساعة', 'العميل', 'المصنع', 'رقم الموديل', 'الكمية', 'سعر القطعة', 'إجمالي السطر', 'إجمالي الفاتورة', 'الخصم', 'صافي الفاتورة']];
  var n = 0;
  S.invs.filter(function (v) { return v.closed && v.snap; }).sort(function (a, b) { return a.at - b.at; }).forEach(function (v) {
    n++; v.snap.lines.forEach(function (l, i) {
      rows.push([v.no, dstr(v.at), tstr(v.at), v.cust, l.f, l.m, l.q, l.p, r2(l.q * l.p), i ? '' : v.snap.gross, i ? '' : v.snap.disc, i ? '' : v.snap.net]);
    });
  });
  if (!n) { toast('مفيش فواتير مقفولة تتصدّر.'); return; }
  dl('فواتير-ابن-عز-' + new Date().toISOString().slice(0, 10) + '.csv', '﻿' + rows.map(function (r) { return r.map(q).join(','); }).join('\r\n'), 'text/csv;charset=utf-8');
}
function backup() {
  dl('نسخة-ابن-عز-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify({ app: 'ebn-ezz', version: 1, savedAt: Date.now(), products: { items: plain(P.items), at: P.at }, invoices: S }), 'application/json');
}
async function restore(file) {
  try {
    var o = JSON.parse(await file.text());
    if (!o || o.app !== 'ebn-ezz' || !o.products || !Array.isArray(o.products.items) || !o.invoices) throw new Error('الملف ده مش نسخة احتياطية من التطبيق.');
    var items = plain(o.products.items).filter(function (r) { return r.f && r.m != null && isFinite(r.p) && isFinite(r.s); });
    $('rsmsg').innerHTML = '<div class="pv"><b>نسخة فيها ' + items.length + ' موديل و' + (o.invoices.invs || []).length + ' فاتورة</b><div>الاسترجاع بيستبدل البيانات الحالية.</div><div class="btns"><button class="btn" id="applyrs" type="button">استرجاع</button><button class="btn sec" id="cancelrs" type="button">إلغاء</button></div></div>';
    restore.pending = { items: items, at: o.products.at || null, inv: o.invoices };
  } catch (e) { restore.pending = null; $('rsmsg').innerHTML = '<div class="pv"><span class="err">' + esc(e.message || 'الملف مش مقروء.') + '</span></div>'; }
}
function applyRestore() {
  var p = restore.pending; if (!p) return;
  setProducts(p.items.map(function (r) { return { f: r.f, m: r.m, p: Number(r.p), s: Number(r.s) }; }), p.at);
  S = cleanInvs(p.inv); pruneOpen();
  if (!S.invs.length) newInv(); if (!cur()) S.cur = S.invs[S.invs.length - 1].id;
  saveProducts(); saveInv(); restore.pending = null; $('rsmsg').innerHTML = '';
  factory = ''; renderSettings(); renderChips(); renderTabs(); toast('اتسترجعت النسخة الاحتياطية.');
}
function renderSettings() {
  $('pinfo').textContent = P.items.length ? (P.items.length + ' موديل من ' + facs.length + ' مصنع. آخر تحديث: ' + (P.at ? dstr(P.at) + ' ' + tstr(P.at) : 'مش معروف')) : 'مفيش موديلات لسه. ارفع ملف الإكسل.';
}


async function runDiag() {
  var out = [];
  function line(ok, okT, badT) { out.push('<li>' + (ok ? 'تمام: ' + okT : '<span class="err">مشكلة: ' + badT + '</span>') + '</li>'); }
  line(window.isSecureContext, 'الصفحة مفتوحة على رابط آمن (https)', 'الصفحة مش على https، فالتثبيت مش هيشتغل. افتح الرابط اللي بيبدأ بـ https.');
  var mOk = false, mIcons = false;
  try {
    var r = await fetch('manifest.webmanifest', { cache: 'no-store' });
    if (r.ok) { var j = await r.json(); mOk = !!(j && j.name && j.start_url); var ir = await fetch(j.icons[0].src, { cache: 'no-store' }); mIcons = ir.ok; }
  } catch (e) {}
  line(mOk, 'ملف manifest موجود', 'ملف manifest.webmanifest مش بيتحمل. اتأكد إنك رفعت كل الملفات في نفس المكان.');
  line(mIcons, 'الأيقونات موجودة', 'ملفات الأيقونات (icon-192.png وغيرها) ناقصة أو في مكان غلط.');
  var swOk = false;
  try { var reg = await navigator.serviceWorker.getRegistration(); swOk = !!(reg && reg.active); } catch (e) {}
  line(swOk, 'الـ service worker شغال', 'الـ service worker مش شغال. ملف sw.js ناقص أو في مكان غلط. اقفل التطبيق وافتحه تاني.');
  var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  out.push('<li>' + (standalone ? 'التطبيق شغال كتطبيق مثبّت.' : 'مفتوح من المتصفح حاليًا.') + '</li>');
  if (!standalone) out.push('<li>' + (window.__ip ? 'تمام: كروم جاهز يثبّت التطبيق. اضغط زر التثبيت اللي ظهر.' : 'كروم لسه ماعرضش التثبيت. لو كل اللي فوق تمام: اقفل الصفحة وافتحها مرتين، أو استخدم قائمة كروم (⋮) ثم "إضافة إلى الشاشة الرئيسية".') + '</li>');
  $('diagout').innerHTML = '<div class="pv"><ul>' + out.join('') + '</ul></div>';
}

/* ================= التنقل والأحداث ================= */
function show(v) {
  view = v;
  $('v-models').hidden = v !== 'm'; $('v-inv').hidden = v !== 'i'; $('v-set').hidden = v !== 's';
  $('tab-m').setAttribute('aria-selected', v === 'm'); $('tab-i').setAttribute('aria-selected', v === 'i'); $('tab-s').setAttribute('aria-selected', v === 's');
  $('ttl').textContent = v === 'm' ? 'بحث برقم الموديل' : v === 'i' ? 'الفواتير' : 'الإعدادات';
  if (v === 'i') showSub(invSub); else if (v === 'm') { renderChips(); renderModels(); } else renderSettings();
  window.scrollTo(0, 0);
}
function showSub(s) {
  invSub = s;
  $('p-cur').hidden = s !== 'cur'; $('p-hist').hidden = s !== 'hist';
  $('sub-cur').setAttribute('aria-pressed', s === 'cur'); $('sub-hist').setAttribute('aria-pressed', s === 'hist');
  if (s === 'cur') renderInv(); else renderHist();
}
function confirmBtn(b, label, fn) {
  if (b.dataset.sure) { fn(); return; }
  var oc = b.className, ot = b.textContent;
  b.dataset.sure = '1'; b.className = 'btn warn'; b.textContent = label;
  setTimeout(function () { if (b.isConnected) { delete b.dataset.sure; b.className = oc; b.textContent = ot; } }, 3000);
}
document.addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  var d = b.dataset;
  if (d.add !== undefined) return setQty(d.add, 1);
  if (d.inc !== undefined) return setQty(d.inc, inCur(d.inc) + 1);
  if (d.dec !== undefined) return setQty(d.dec, inCur(d.dec) - 1);
  if (d.goset) return show('s');
  if (d.more !== undefined) { factory = d.more; $('q').value = ''; show('m'); return; }
  if (d.sel) { S.cur = d.sel; saveInv(); renderTabs(); renderInv(); return; }
  if (d.open) { S.cur = d.open; saveInv(); renderTabs(); showSub('cur'); window.scrollTo(0, 0); return; }
  if (b.id === 'newinv') { var c0 = cur(); if (!(c0 && !c0.closed && !Object.keys(c0.items).length)) newInv(); saveInv(); renderTabs(); renderInv(); return; }
  if (d.mode) { var c2 = cur(); c2.mode = d.mode; saveInv(); renderInv(); renderTabs(); return; }
  if (d.dt) { var c3 = cur(); c3.dtype = d.dt; saveInv(); renderInv(); renderTabs(); return; }
  if (b.id === 'close') {
    var c4 = cur(), t = calc(c4);
    c4.snap = { lines: lines(c4), gross: t.gross, disc: t.disc, net: t.net, pcs: t.pcs };
    c4.closed = true; c4.at = Date.now(); saveInv(); renderTabs(); renderInv(); window.scrollTo(0, 0); toast('اتقفلت فاتورة ' + c4.no + '. الصافي ' + fmt(t.net)); return;
  }
  if (b.id === 'reopen') { var c5 = cur(); c5.closed = false; c5.snap = null; c5.at = null; saveInv(); renderTabs(); renderInv(); return; }
  if (b.id === 'del') {
    confirmBtn(b, 'اضغط تاني لحذف الفاتورة', function () {
      S.invs = S.invs.filter(function (v) { return v.id !== S.cur; });
      if (S.renum) { S.invs.forEach(function (v, i) { v.no = i + 1; }); S.next = S.invs.length + 1; }
      if (!S.invs.length) newInv(); else S.cur = S.invs[S.invs.length - 1].id;
      saveInv(); renderTabs(); renderInv();
    }); return;
  }
  if (b.id === 'copy' || b.id === 'share') {
    var txt = invText(cur());
    var fb = function () { var o = $('out'); o.hidden = false; o.value = txt; o.focus(); o.select(); $('msg').textContent = 'انسخ النص من الخانة اللي ظهرت.'; };
    if (b.id === 'share' && navigator.share) { navigator.share({ text: txt }).catch(function () {}); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { toast('اتنسخت. الصقها في واتساب.'); }, fb); else fb();
    return;
  }
  if (b.id === 'print') return printInv(cur());
  if (b.id === 'impbtn') return $('impf').click();
  if (b.id === 'applyimp') return applyImport();
  if (b.id === 'cancelimp') { pending = null; $('imp').innerHTML = ''; return; }
  if (b.id === 'diag') return runDiag();
  if (b.id === 'bk') return backup();
  if (b.id === 'csv') return exportCSV();
  if (b.id === 'rs') return $('rsf').click();
  if (b.id === 'applyrs') return applyRestore();
  if (b.id === 'cancelrs') { restore.pending = null; $('rsmsg').innerHTML = ''; return; }
  if (b.id === 'inst' && window.__ip) { window.__ip.prompt(); window.__ip = null; b.hidden = true; return; }
});
document.addEventListener('change', function (e) {
  var t = e.target;
  if (t.id === 'renum') { S.renum = t.checked; saveInv(); return; }
  if (t.id === 'impf') { var f = t.files[0]; t.value = ''; if (f) handleImport(f); return; }
  if (t.id === 'rsf') { var g = t.files[0]; t.value = ''; if (g) restore(g); return; }
  var i = t.closest && t.closest('input[data-qty]'); if (i) setQty(i.dataset.qty, i.value);
});
document.addEventListener('input', function (e) {
  if (e.target.id === 'dval') { var c = cur(); c.dval = Math.max(0, parseFloat(e.target.value) || 0); saveInv(); updateTotals(); }
});
$('chips').addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (!b) return; factory = b.getAttribute('data-f'); renderChips(); renderModels(); });
$('q').addEventListener('input', renderModels);
$('clr').addEventListener('click', function () { $('q').value = ''; renderModels(); $('q').focus(); });
$('cust').addEventListener('input', function () { var c = cur(); if (c && !c.closed) { c.cust = this.value; saveInv(); } });
$('hq').addEventListener('input', renderHist);
$('tab-m').addEventListener('click', function () { show('m'); });
$('tab-i').addEventListener('click', function () { show('i'); });
$('tab-s').addEventListener('click', function () { show('s'); });
$('sub-cur').addEventListener('click', function () { showSub('cur'); });
$('sub-hist').addEventListener('click', function () { showSub('hist'); });
$('h-today').addEventListener('click', function () { histScope = 'today'; $('h-today').setAttribute('aria-pressed', true); $('h-all').setAttribute('aria-pressed', false); renderHist(); });
$('h-all').addEventListener('click', function () { histScope = 'all'; $('h-all').setAttribute('aria-pressed', true); $('h-today').setAttribute('aria-pressed', false); renderHist(); });
window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); window.__ip = e; $('inst').hidden = false; });

/* ================= التشغيل ================= */
loadProducts(); loadInv();
renderChips(); renderModels(); renderTabs(); renderSettings();
window.EE = { get S() { return S; }, get P() { return P; } };
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then(function (ok) { $('st').textContent = ok ? 'التخزين محمي من المسح التلقائي.' : 'ملحوظة: المتصفح ممكن يمسح البيانات لو المساحة قلّت. حمّل نسخة احتياطية من وقت للتاني.'; });
}
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then(function () {
    navigator.serviceWorker.ready.then(function () { $('sw').textContent = 'التطبيق جاهز يشتغل من غير نت.'; });
  }).catch(function () { $('sw').textContent = 'العمل بدون نت مش متاح هنا.'; });
} else { $('sw').textContent = 'العمل بدون نت محتاج الاستضافة على رابط https.'; }
})();
