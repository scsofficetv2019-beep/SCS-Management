/* SCS Chemical Order — UI (আগের Index.html এর স্ক্রিপ্ট, SCS Management অ্যাকাউন্টের জন্য পরিবর্তিত) */
(function () {
'use strict';

/* ------------------------------------------------------------------ helpers */
var $ = function (id) { return document.getElementById(id); };
var LS = {
  get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
};
var S = {
  lang: LS.get('scs_lang') === 'bn' ? 'bn' : 'en', theme: LS.get('scs_theme') || 'light',
  role: '', adminPin: '', tab: 'order', app: { nextOrderNo: '', productNameList: [], packSizeList: [], unitList: [], orderByList: [], availableSheets: [] },
  edit: null, rowN: 0, summary: null, ver: '', poll: null, polling: false, cfg: null, adminLen: 4,
  y: new Date().getFullYear(), m: new Date().getMonth() + 1
};
var SESSION_KEY = 'scs_session';
var MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var MONTHS_BN = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
var DEFAULT_LOGO = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22white%22%2F%3E%3Ccircle%20cx%3D%2232%22%20cy%3D%2232%22%20r%3D%2226%22%20fill%3D%22none%22%20stroke%3D%22%23e5007d%22%20stroke-width%3D%225%22%2F%3E%3Ctext%20x%3D%2232%22%20y%3D%2238%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2218%22%20font-weight%3D%22700%22%20fill%3D%22%23334155%22%3ESCS%3C%2Ftext%3E%3C%2Fsvg%3E';

function t(en, bn) { return S.lang === 'bn' ? bn : en; }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fmt(n) {
  var v = Number(n || 0);
  if (isNaN(v)) return '0';
  return String(Math.round(v * 100) / 100).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}
function normMobile(m) {
  var d = String(m || '').trim().replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10) return '880' + d;
  if (d.length === 11 && d.indexOf('0') === 0) return '880' + d.slice(1);
  if (d.length === 13 && d.indexOf('880') === 0) return '880' + d.slice(3);
  return '';
}
function gs(name) {
  var args = Array.prototype.slice.call(arguments, 1);
  return new Promise(function (res, rej) {
    if (typeof google === 'undefined' || !google.script || !google.script.run) { rej(new Error('Apps Script connection unavailable')); return; }
    var r = google.script.run.withSuccessHandler(res).withFailureHandler(function (e) { rej(new Error(e && e.message ? e.message.replace(/^Error:\s*/, '') : String(e))); });
    r[name].apply(r, args);
  });
}

var IC = {
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M8 16H3v5"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  backspace: '<path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><path d="m18 9-6 6M12 9l6 6"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  ok: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  print: '<path d="M6 9V2h12v7"/><rect x="6" y="14" width="12" height="8"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'
};
function ic(n, c) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="' + (c || 'w-4 h-4') + '">' + IC[n] + '</svg>';
}
function paintIcons(root) {
  (root || document).querySelectorAll('[data-ic]').forEach(function (el) {
    if (!el.dataset.painted) { el.innerHTML = ic(el.dataset.ic, el.dataset.cls); el.dataset.painted = '1'; }
  });
}

/* ------------------------------------------------------------------ class sets */
var K = {
  card: 'bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs',
  inp: 'inp', lbl: 'block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1',
  btn: 'btn-p', pink: 'bg-pink-600 hover:bg-pink-700 text-white shadow-md shadow-pink-600/25',
  green: 'bg-emerald-600 hover:bg-emerald-700 text-white', red: 'bg-rose-600 hover:bg-rose-700 text-white',
  amber: 'bg-amber-500 hover:bg-amber-600 text-white', blue: 'bg-blue-600 hover:bg-blue-700 text-white',
  slate: 'bg-slate-700 hover:bg-slate-600 text-white',
  ghost: 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
};

/* ------------------------------------------------------------------ UI: loading / toast / popup */
function loading(on) { $('loading').classList.toggle('hidden', !on); }
var toastTimer = null;
function toast(msg, type) {
  type = type || 'info';
  var cls = { success: 'bg-emerald-950/90 border-emerald-700 text-emerald-100', error: 'bg-rose-950/90 border-rose-700 text-rose-100', info: 'bg-slate-900/95 border-slate-700 text-white' }[type];
  var icn = { success: ic('ok', 'w-4 h-4 text-emerald-500'), error: ic('alert', 'w-4 h-4 text-rose-500'), info: ic('info', 'w-4 h-4 text-blue-500') }[type];
  var el = $('toast');
  el.innerHTML = '<div class="flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-2xl border backdrop-blur-md text-xs font-semibold ' + cls + '">' + icn + '<span>' + esc(msg) + '</span></div>';
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.add('hidden'); }, 3200);
}
var popupResolve = null;
function popup(text, opt) {
  opt = opt || {};
  $('popupText').textContent = text;
  $('popupCancel').classList.toggle('hidden', !opt.confirm);
  $('popup').classList.remove('hidden');
  return new Promise(function (res) { popupResolve = res; });
}
function closePopup(v) { $('popup').classList.add('hidden'); if (popupResolve) { var r = popupResolve; popupResolve = null; r(v); } }

/* ------------------------------------------------------------------ PIN pad (login + modals) */
function mountPad(root, o) {
  var max = 8, pin = '', busy = false;
  var nb = 'h-14 rounded-2xl text-xl font-bold bg-slate-100/90 hover:bg-pink-50 hover:text-pink-600 active:scale-95 dark:bg-slate-800 dark:hover:bg-slate-700/80 dark:hover:text-pink-400 transition-all duration-150 flex items-center justify-center shadow-xs cursor-pointer';
  var dots = '';
  for (var i = 0; i < max; i++) dots += '<div class="w-4 h-4 rounded-full transition-all duration-200 bg-slate-200 dark:bg-slate-700"></div>';
  var keys = '';
  '123456789'.split('').forEach(function (k) { keys += '<button type="button" data-k="' + k + '" class="' + nb + '">' + k + '</button>'; });
  root.innerHTML = '<div data-dots class="flex justify-center items-center gap-3.5 mb-6 h-12">' + dots + '</div>' +
    '<div class="grid grid-cols-3 gap-3 mb-4">' + keys +
    '<button type="button" data-k="C" class="h-14 rounded-2xl text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 active:scale-95 bg-slate-100/60 dark:bg-slate-800/40 transition-all flex items-center justify-center cursor-pointer">CLEAR</button>' +
    '<button type="button" data-k="0" class="' + nb + '">0</button>' +
    '<button type="button" data-k="B" class="h-14 rounded-2xl text-slate-600 hover:text-rose-600 active:scale-95 bg-slate-100/60 dark:bg-slate-800/40 dark:text-slate-300 dark:hover:text-rose-400 transition-all flex items-center justify-center cursor-pointer">' + ic('backspace', 'w-5 h-5') + '</button></div>';
  function paint() {
    var ds = root.querySelectorAll('[data-dots] > div');
    ds.forEach(function (d, idx) {
      d.className = 'w-4 h-4 rounded-full transition-all duration-200 ' + (pin.length > idx ? 'bg-pink-600 scale-125 shadow-md shadow-pink-500/50' : 'bg-slate-200 dark:bg-slate-700');
    });
    if (o.onChange) o.onChange(pin);
  }
  function submit(silent) {
    if (busy || pin.length < 4) return;
    busy = true;
    Promise.resolve(o.onSubmit(pin, silent)).then(function (ok) {
      busy = false;
      if (!ok) { if (!silent) { pad.shake(); pin = ''; paint(); } }
    }, function () { busy = false; });
  }
  function push(k) {
    if (busy) return;
    if (k === 'C') pin = '';
    else if (k === 'B') pin = pin.slice(0, -1);
    else if (pin.length < max) {
      pin += k;
      paint();
      var lens = o.auto ? o.auto() : [];
      if (lens.indexOf(pin.length) > -1) { setTimeout(function () { if (lens.length && pin.length === lens[lens.length - 1]) submit(false); else submit(true); }, 40); return; }
    }
    paint();
  }
  root.addEventListener('click', function (e) { var b = e.target.closest('[data-k]'); if (b) push(b.dataset.k); });
  var pad = {
    get: function () { return pin; }, clear: function () { pin = ''; paint(); }, submit: function () { submit(false); },
    key: function (e) {
      if (!o.active()) return;
      if (/^[0-9]$/.test(e.key)) push(e.key); else if (e.key === 'Backspace') push('B'); else if (e.key === 'Enter') submit(false);
    },
    shake: function () { var c = o.card; if (!c) return; c.classList.add('animate-bounce', 'border-red-500'); setTimeout(function () { c.classList.remove('animate-bounce', 'border-red-500'); }, 500); }
  };
  window.addEventListener('keydown', pad.key);
  paint();
  return pad;
}

/* ------------------------------------------------------------------ language / theme */
function applyLang() {
  document.documentElement.lang = S.lang;
  document.querySelectorAll('[data-i]').forEach(function (el) { var p = el.dataset.i.split('|'); el.textContent = S.lang === 'bn' ? p[1] : p[0]; });
  document.querySelectorAll('[data-ph]').forEach(function (el) { var p = el.dataset.ph.split('|'); el.placeholder = S.lang === 'bn' ? p[1] : p[0]; });
  document.querySelectorAll('[data-langlbl]').forEach(function (el) { el.textContent = S.lang === 'bn' ? 'EN' : 'বাংলা'; });
  $('submitLbl').textContent = S.edit ? t('Save Changes', 'পরিবর্তন সেভ করুন') : (isResub() ? t('Resubmit', 'রিসাবমিট') : t('Submit Order', 'অর্ডার সাবমিট'));
  renderNav();
  buildMonthSel();
  renderThemeIc();
}
function applyTheme() {
  document.documentElement.classList.toggle('dark', S.theme === 'dark');
  $('wrap').className = 'min-h-screen flex flex-col transition-colors duration-200 ' + (S.theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-800');
  $('loginCard').className = 'w-full max-w-sm rounded-3xl p-6 md:p-8 shadow-2xl border transition-all duration-300 backdrop-blur-xl ' + (S.theme === 'dark' ? 'bg-slate-900/95 border-slate-800' : 'bg-white/95 border-slate-200/80');
  renderThemeIc();
}
function renderThemeIc() { $('themeIc').innerHTML = S.theme === 'dark' ? ic('sun', 'w-3.5 h-3.5 text-amber-300') : ic('moon', 'w-3.5 h-3.5 text-white'); }

/* ------------------------------------------------------------------ session / login */
function sessionOk() {
  try { var d = JSON.parse(LS.get(SESSION_KEY) || '{}'); return d.loggedIn && d.expiresAt > Date.now() ? d : null; } catch (e) { return null; }
}
function setSession(role) { if (role) LS.set(SESSION_KEY, JSON.stringify({ loggedIn: true, role: role, expiresAt: Date.now() + 7 * 86400000 })); else LS.del(SESSION_KEY); }

var loginPad = null;
function doLogin(pin, silent) {
  return gs('verifyLogin', pin).then(function (r) {
    if (!r.ok) { if (!silent) toast(t('Wrong PIN!', 'ভুল পিন!'), 'error'); return false; }
    S.role = r.role; if (r.role === 'admin') S.adminPin = pin;
    setSession(r.role);
    loginPad.clear();
    bootstrap();
    return true;
  }).catch(function (e) { toast(e.message, 'error'); return false; });
}
function logout() {
  /* SCS Management: অ্যাপ থেকে বের হলে পোর্টালে ফিরে যাবে */
  setSession(null); S.edit = null;
  SCS.backToPortal();
}

/* ------------------------------------------------------------------ extensions */
Object.assign(IC, {
  dash: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  tl: '<path d="M12 3v18"/><circle cx="12" cy="7" r="2"/><circle cx="12" cy="17" r="2"/><path d="M14 7h6M4 17h6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>'
});
Object.assign(IC, {
  eye: '<path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8-10-8-10-8z"/><circle cx="12" cy="12" r="3"/>',
  truck: '<path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  up: '<path d="m18 15-6-6-6 6"/>'
});
var NO_PACK = 'No Pack';
var wq = Promise.resolve();
function gsRetry(args, n) {
  return gs.apply(null, args).catch(function (e) {
    if (n < 3 && /lock|timed out|timeout|busy|too many|Service invoked|Exception: Service/i.test(e.message)) return new Promise(function (r) { setTimeout(r, 1200 * (n + 1)); }).then(function () { return gsRetry(args, n + 1); });
    throw e;
  });
}
function gsq() { var args = Array.prototype.slice.call(arguments), p = wq.then(function () { return gsRetry(args, 0); }); wq = p.catch(function () {}); return p; }
var barCount = 0;
loading = function (on) { barCount = Math.max(0, barCount + (on ? 1 : -1)); $('bar').classList.toggle('hidden', barCount === 0); };
Object.assign(S, { dtab: 'today', sumOpen: true, statOpen: '', stats: null, pr: null, tc: null, backupDone: false, dirty: {}, cache: {}, view: LS.get('scs_view') || 'cards', q: '', seller: '', sort: 'new', limit: 40, admTab: 'sms', hist: null, hq: '', cur: [], dataVer: '', entered: false, cfg: null, ordMap: {}, open: {} });
S.app.products = []; S.app.sellers = []; S.app.lastPrices = {};

/* ------------------------------------------------------------------ bootstrap (cache-first, fast) */
function applyBoot(d) {
  S.app = d;
  var uniq = function (a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); };
  d.products.forEach(function (p) { if (!p.packSizes) p.packSizes = p.packSize ? [p.packSize] : []; });
  S.app.productNameList = uniq(d.products.map(function (p) { return p.productName; }));
  S.app.unitList = uniq(d.products.map(function (p) { return p.unit; }));
  S.app.packSizeList = uniq([].concat.apply([], d.products.map(function (p) { return p.packSizes; })));
  S.dataVer = d.ver || S.dataVer;
  fillOrderBy(d.orderByList);
}
function enterApp() {
  if (S.entered) return; S.entered = true;
  $('loginView').classList.add('hidden'); $('appView').classList.remove('hidden');
  $('roleChip').textContent = S.role === 'admin' ? 'Admin' : 'User';
  clearForm(true); showTab('dash');
  setInterval(pollVer, 8000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) pollVer(); });
}
function bootstrap() {
  var c = LS.get('scs_boot');
  if (c) { try { applyBoot(JSON.parse(c)); enterApp(); } catch (e) {} }
  loading(true);
  return gs('getBootstrapData').then(function (d) {
    loading(false);
    LS.set('scs_boot', JSON.stringify(d));
    applyBoot(d); setOrderNo(d.nextOrderNo);
    enterApp();
  }).catch(function (e) { loading(false); toast(t('Error loading data: ', 'ডাটা লোড হয়নি: ') + e.message, 'error'); });
}
function fillOrderBy(list) {
  var sel = $('orderBy'), cur = sel.value;
  sel.innerHTML = '<option value="">' + t('-- Select --', '-- নির্বাচন করুন --') + '</option>' + (list || []).map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join('');
  sel.value = cur;
}
var polling2 = false;
function pollVer() {
  if (document.hidden || polling2) return;
  polling2 = true;
  gs('getDataVersion').then(function (v) { polling2 = false; if (v !== S.dataVer) { S.dataVer = v; liveRefresh(); } }).catch(function () { polling2 = false; });
}
function liveRefresh() {
  gs('getLists').then(function (l) {
    var d = S.app; d.products = l.products; d.sellers = l.sellers; d.orderByList = l.orderByList; d.ver = l.ver; applyBoot(d); LS.set('scs_boot', JSON.stringify(d));
    if (S.tab === 'admin' && (S.admTab === 'products' || S.admTab === 'sellers') && $('entForm') && $('entForm').classList.contains('hidden')) renderAdmin();
  }).catch(function () {});
  if (S.tab === 'order' && !S.edit) gs('getNextOrderNo').then(setOrderNo).catch(function () {});
  refreshVisible(true);
}
function refreshVisible(keep) {
  if (!keep) { S.cache = {}; S.stats = null; }
  if (S.tab === 'dash') renderDash(); else if (S.tab === 'orders') loadOrders();
  else if (S.tab === 'history') loadHistory();
}
/* ------------------------------------------------------------------ nav */
var VIEWS = { dash: 'viewDash', order: 'viewOrder', orders: 'viewOrders', admin: 'viewAdmin', history: 'viewHistory' };
function navItems() {
  return [
    { id: 'dash', icon: '🏠', en: 'Dashboard', bn: 'ড্যাশবোর্ড' },
    { id: 'order', icon: '🧾', en: 'New Order', bn: 'নতুন অর্ডার' },
    { id: 'orders', icon: '📋', en: 'All Orders', bn: 'সব অর্ডার' },
    { id: 'admin', icon: '⚙️', en: 'Admin', bn: 'অ্যাডমিন' },
    { id: 'history', icon: '🕘', en: 'History', bn: 'হিস্ট্রি' }
  ];
}
function renderNav() {
  $('navScroll').innerHTML = navItems().map(function (n) {
    var on = S.tab === n.id;
    return '<button type="button" data-act="tab" data-id="' + n.id + '" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer active:scale-95 ' +
      (on ? 'bg-pink-600 text-white shadow-xs font-bold scale-[1.02]' : 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 hover:bg-pink-50 hover:text-pink-600 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700') + '"><span>' + n.icon + '</span><span>' + t(n.en, n.bn) + '</span></button>';
  }).join('');
}
function showTab(id) {
  S.tab = id;
  Object.keys(VIEWS).forEach(function (k) { $(VIEWS[k]).classList.toggle('hidden', k !== id); });
  renderNav(); window.scrollTo(0, 0);
  if (id === 'dash') renderDash();
  if (id === 'orders') { buildFilters(); loadOrders(); }
  if (id === 'history') loadHistory();
}
function openTab(id) {
  if (id === 'admin') { openAdmin(); return; }
  if (id === 'orders') { S.y = new Date().getFullYear(); S.m = new Date().getMonth() + 1; S.q = ''; $('sumSearch').value = ''; }
  showTab(id);
}

/* ------------------------------------------------------------------ PIN modal */
var pinPad = null, pinResolve = null, pinKind = 'edit';
/* SCS Management: এডিট = যেকোনো ইউজার (অ্যাকাউন্টই যথেষ্ট)।
   অ্যাডমিন কাজ = শুধু Admin রোল + অ্যাডমিন পিন (Admin Console এ সেট করা)। একবার পিন দিলে এই সেশনে আর লাগবে না। */
function askPin(kind) {
  if (kind !== 'admin') return Promise.resolve('account');
  if (S.role !== 'admin') {
    popup(t('This needs Admin access for SCS Chemical Order. Ask the SCS Management admin.', 'এই কাজের জন্য SCS Chemical Order-এ Admin অ্যাক্সেস লাগবে। SCS Management অ্যাডমিনের কাছে অনুমতি চান।'));
    return Promise.resolve(null);
  }
  if (S.adminPin) return Promise.resolve(S.adminPin);
  return askPinLegacy('admin', 'Admin Security PIN', 'অ্যাডমিন নিরাপত্তা পিন', 'Enter the Admin PIN to continue', 'চালিয়ে যেতে অ্যাডমিন পিন দিন').then(function (pin) {
    if (pin) S.adminPin = pin;
    return pin;
  });
}
function askPinLegacy(kind, titleEn, titleBn, descEn, descBn) {
  pinKind = kind;
  $('pinTitle').textContent = t(titleEn, titleBn); $('pinDesc').textContent = t(descEn, descBn);
  $('pinModal').classList.remove('hidden');
  if (!pinPad) {
    pinPad = mountPad($('pinPad'), {
      card: $('pinCard'),
      active: function () { return !$('pinModal').classList.contains('hidden'); },
      auto: function () { return pinKind === 'admin' ? [S.adminLen] : (S.adminLen === 4 ? [4] : [4, S.adminLen]); },
      onSubmit: function (pin, silent) {
        return gs(pinKind === 'admin' ? 'verifyAdminPin' : 'verifyEditPin', pin).then(function (r) {
          if (!r.ok) { if (!silent) toast(t('Wrong PIN!', 'ভুল পিন!'), 'error'); return false; }
          pinPad.clear(); $('pinModal').classList.add('hidden');
          var rs = pinResolve; pinResolve = null; if (rs) rs(pin);
          return true;
        }).catch(function (e) { toast(e.message, 'error'); return false; });
      }
    });
  }
  pinPad.clear();
  return new Promise(function (res) { pinResolve = res; });
}
function closePin() { $('pinModal').classList.add('hidden'); if (pinResolve) { var r = pinResolve; pinResolve = null; r(null); } }
function askAdmin() { return askPin('admin', 'Admin PIN required', 'অ্যাডমিন পিন লাগবে', 'Enter the Admin PIN to continue.', 'চালিয়ে যেতে অ্যাডমিন পিন দিন।'); }

/* ------------------------------------------------------------------ ORDER FORM (smart) */
function uniqArr(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); }
function variants(name, key) {
  var ps = S.app.products.filter(function (p) { return p.productName === name; });
  if (!ps.length) return key === 'unit' ? S.app.unitList : uniqArr(S.app.packSizeList.concat([NO_PACK]));
  if (key === 'unit') { var u = uniqArr(ps.map(function (p) { return p.unit; })); return u.length ? u : S.app.unitList; }
  var l = uniqArr([].concat.apply([], ps.map(function (p) { return p.packSizes || []; })));
  return l.length ? l : [NO_PACK];
}
function opts(list, sel, ph) {
  var arr = (list || []).slice();
  if (sel && arr.indexOf(sel) === -1) arr.push(sel);
  return '<option value="">' + esc(ph) + '</option>' + arr.map(function (x) { return '<option value="' + esc(x) + '"' + (String(x) === String(sel) ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('');
}
function isResub() { return false; }
function addRow(p) {
  p = p || {}; S.rowN++;
  var id = S.rowN, div = document.createElement('div');
  div.className = 'prow relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 p-2.5 sm:p-3';
  div.dataset.id = id;
  var f = function (lbl, extra) { return '<div><label class="' + K.lbl + '">' + lbl + '</label>' + extra + '</div>'; };
  div.innerHTML =
    '<div class="flex items-center justify-between mb-2"><span class="w-6 h-6 rounded-full bg-pink-600 text-white text-[11px] font-black flex items-center justify-center shadow-md shadow-pink-600/30 pbadge"></span><span class="f-hint text-[10px] text-slate-500 truncate px-2 flex-1"></span>' +
    '<button type="button" data-lock data-act="delRow" data-id="' + id + '" class="p-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-600 cursor-pointer active:scale-95 transition-all">' + ic('trash', 'w-3.5 h-3.5') + '</button></div>' +
    '<div class="mb-2 relative"><label class="' + K.lbl + '">' + t('Product Name*', 'প্রোডাক্টের নাম*') + '</label><input data-lock class="inp f-name" autocomplete="off" data-orig="' + esc(p.productName || '') + '" value="' + esc(p.productName || '') + '" placeholder="' + t('Type to search product...', 'প্রোডাক্ট খুঁজতে লিখুন...') + '" />' +
    '<div class="ac hidden absolute left-0 right-0 top-full mt-1 z-20 max-h-52 overflow-y-auto rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl"></div></div>' +
    '<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">' +
      f(t('Unit*', 'ইউনিট*'), '<select data-lock class="inp f-unit">' + opts(variants(p.productName, 'unit'), p.unit, t('-- Unit --', '-- ইউনিট --')) + '</select>') +
      f(t('Pack Size*', 'প্যাক সাইজ*'), '<select data-lock class="inp f-pack">' + opts(variants(p.productName, 'packSize'), p.packSize, t('-- Pack --', '-- প্যাক --')) + '</select>') +
      f(t('Quantity*', 'পরিমাণ*'), '<input data-lock type="number" min="0" inputmode="decimal" class="inp f-qty" value="' + esc(p.quantity || '') + '" />') +
      f(t('Unit Price', 'ইউনিট প্রাইস'), '<input data-lock type="number" min="0" inputmode="decimal" class="inp f-up" value="' + esc(p.unitPrice || '') + '" />') +
      f(t('Discount Price', 'ডিসকাউন্ট প্রাইস'), '<input data-lock type="number" min="0" inputmode="decimal" class="inp f-dup" value="' + esc(p.discountUnitPrice || '') + '" />') +
    '</div>' +
    '<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-2 p-2 rounded-xl border border-dashed border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">' +
      f(t('Total', 'মোট'), '<input readonly class="inp f-total" />') +
      f(t('Special', 'স্পেশাল'), '<input readonly class="inp f-special" />') +
      f(t('Eng. Com', 'ইঞ্জি. কমিশন'), '<input data-lock type="number" min="0" inputmode="decimal" class="inp f-eng" value="' + esc(p.engCom || '') + '" />') +
      f(t('Con. Com', 'কন্ট্রা. কমিশন'), '<input data-lock type="number" min="0" inputmode="decimal" class="inp f-con" value="' + esc(p.conCom || '') + '" />') +
      f(t('Commission', 'কমিশন'), '<input readonly class="inp f-comm" />') +
    '</div>';
  $('productRows').appendChild(div);
  badges();
  if (isResub()) lockAll(true);
}
function badges() { $('productRows').querySelectorAll('.prow').forEach(function (r, i) { r.querySelector('.pbadge').textContent = i + 1; }); }
function delRow(id) {
  if ($('productRows').querySelectorAll('.prow').length <= 1) { toast(t('Minimum one product row required.', 'কমপক্ষে একটি প্রোডাক্ট লাগবে।'), 'error'); return; }
  var r = $('productRows').querySelector('[data-id="' + id + '"]'); if (r) r.remove();
  badges(); recalc();
}
function chooseProduct(row, name, auto) {
  row.querySelector('.f-name').value = name;
  var us = row.querySelector('.f-unit'), ps = row.querySelector('.f-pack');
  var uc = us.value, pc = ps.value;
  var ul = variants(name, 'unit'), pl = variants(name, 'packSize');
  us.innerHTML = opts(ul, ul.indexOf(uc) > -1 ? uc : '', t('-- Unit --', '-- ইউনিট --'));
  ps.innerHTML = opts(pl, pl.indexOf(pc) > -1 ? pc : '', t('-- Pack --', '-- প্যাক --'));
  if (!us.value && ul.length === 1) us.value = ul[0];
  if (!ps.value && pl.length === 1) ps.value = pl[0];
  var lp = S.app.lastPrices[name];
  if (auto && lp) {
    [['f-up', 'up'], ['f-dup', 'dup'], ['f-eng', 'eng'], ['f-con', 'con']].forEach(function (m) { var el = row.querySelector('.' + m[0]); if (!el.value && lp[m[1]] !== '' && lp[m[1]] != null) el.value = lp[m[1]]; });
    row.querySelector('.f-hint').textContent = t('Last: ', 'সর্বশেষ: ') + '৳' + fmt(lp.up) + ' / ৳' + fmt(lp.dup);
  } else row.querySelector('.f-hint').textContent = '';
  row.querySelector('.ac').classList.add('hidden');
  recalc();
}
function onProdInput(inp) {
  var row = inp.closest('.prow'), ac = row.querySelector('.ac'), q = inp.value.toLowerCase().trim();
  var list = S.app.productNameList.filter(function (n) { return !q || n.toLowerCase().indexOf(q) > -1; }).slice(0, 10);
  if (S.app.productNameList.indexOf(inp.value) > -1) { chooseProduct(row, inp.value, true); return; }
  if (!list.length) { ac.classList.add('hidden'); return; }
  ac.innerHTML = list.map(function (n) { return '<div data-act="pickProd" data-v="' + esc(n) + '" class="px-3 py-2 text-xs cursor-pointer hover:bg-pink-50 dark:hover:bg-slate-700 border-b border-slate-100 dark:border-slate-700">' + esc(n) + '</div>'; }).join('');
  ac.classList.remove('hidden');
}
function rowsData() {
  var out = [];
  $('productRows').querySelectorAll('.prow').forEach(function (r) {
    var q = function (c) { return r.querySelector(c); };
    var qty = Number(q('.f-qty').value || 0), up = Number(q('.f-up').value || 0), dup = Number(q('.f-dup').value || 0);
    var eng = Number(q('.f-eng').value || 0), con = Number(q('.f-con').value || 0);
    out.push({ productName: q('.f-name').value.trim(), orig: q('.f-name').dataset.orig, unit: q('.f-unit').value, packSize: q('.f-pack').value, quantity: q('.f-qty').value, unitPrice: q('.f-up').value, discountUnitPrice: q('.f-dup').value, totalPrice: qty * up, specialPrice: qty * dup, engCom: eng, conCom: con, rowCommission: qty * (eng + con) });
  });
  return out;
}
function recalc() {
  var tf = Number($('transportFee').value || 0), gt = 0, sp = 0, cm = 0;
  $('productRows').querySelectorAll('.prow').forEach(function (r) {
    var q = function (c) { return r.querySelector(c); };
    var qty = Number(q('.f-qty').value || 0), up = Number(q('.f-up').value || 0), dup = Number(q('.f-dup').value || 0);
    var eng = Number(q('.f-eng').value || 0), con = Number(q('.f-con').value || 0);
    q('.f-total').value = fmt(qty * up); q('.f-special').value = fmt(qty * dup); q('.f-comm').value = fmt(qty * (eng + con));
    gt += qty * up; sp += qty * dup; cm += qty * (eng + con);
  });
  $('tTotal').textContent = fmt(gt); $('tSpecial').textContent = fmt(sp); $('tNet').textContent = fmt(sp + tf);
  $('tDiscount').textContent = fmt(Math.max(0, gt - sp)); $('tComm').textContent = fmt(cm);
}
function lockAll(on) { document.querySelectorAll('#viewOrder [data-lock]').forEach(function (el) { el.disabled = on; }); }
function setOrderNo(n) { S.app.nextOrderNo = n; if (!S.edit) $('orderNoTxt').textContent = n; }
function setFormTexts() {
  $('formTitle').textContent = S.edit ? t('Edit Order', 'অর্ডার এডিট') : t('New Order', 'নতুন অর্ডার');
  $('submitLbl').textContent = S.edit ? t('Save Changes', 'পরিবর্তন সেভ করুন') : t('Submit Order', 'অর্ডার সাবমিট');
  $('clearBtn').classList.toggle('hidden', !!S.edit);
}
function clearForm(skipFetch) {
  S.edit = null;
  ['deliveryDate', 'deliveryTime', 'mobile', 'clientName', 'address', 'transportFee', 'scsTransportCost', 'commissionHolder'].forEach(function (id) { $(id).value = ''; });
  $('orderBy').value = '';
  $('editBanner').classList.add('hidden'); $('editBanner').classList.remove('flex');
  $('productRows').innerHTML = ''; S.rowN = 0; addRow(); recalc(); lockAll(false);
  $('orderNoTxt').textContent = S.app.nextOrderNo || '';
  setFormTexts();
  if (!skipFetch) gs('getNextOrderNo').then(setOrderNo).catch(function () {});
}
function fillForm(res) {
  $('deliveryDate').value = res.deliveryDate || ''; $('deliveryTime').value = res.deliveryTime || '';
  $('mobile').value = res.mobile || ''; $('clientName').value = res.clientName || ''; $('address').value = res.address || '';
  $('transportFee').value = res.transportFee || ''; $('scsTransportCost').value = res.scsTransportCost || '';
  fillOrderBy(S.app.orderByList);
  if (res.orderBy && S.app.orderByList.indexOf(res.orderBy) === -1) $('orderBy').insertAdjacentHTML('beforeend', '<option value="' + esc(res.orderBy) + '">' + esc(res.orderBy) + '</option>');
  $('orderBy').value = res.orderBy || ''; $('commissionHolder').value = res.commissionHolderName || '';
  $('productRows').innerHTML = ''; S.rowN = 0;
  (res.items || []).forEach(function (it) {
    addRow(Object.assign({}, it, { engCom: it.engCom !== '' ? it.engCom : (res.engineerCommissionPerUnit || ''), conCom: it.conCom !== '' ? it.conCom : (res.contractorCommissionPerUnit || '') }));
  });
  badges(); recalc();
}
function startEdit(orderNo, sheetName) {
  askPin('edit', 'Enter PIN to edit order', 'অর্ডার এডিটের পিন দিন', 'User PIN or Admin PIN is required to edit an order.', 'অর্ডার এডিট করতে ইউজার পিন বা অ্যাডমিন পিন লাগবে।').then(function (pin) {
    if (!pin) return;
    loading(true);
    gs('getOrderByNo', orderNo, sheetName).then(function (res) {
      loading(false);
      if (!res.ok) { popup(t('Order not found.', 'অর্ডার পাওয়া যায়নি।')); return; }
      clearForm(true);
      S.edit = { orderNo: orderNo, sheetName: res.sheetName || sheetName, pin: pin };
      fillForm(res);
      $('orderNoTxt').textContent = orderNo; $('editNo').textContent = orderNo;
      $('editBanner').classList.remove('hidden'); $('editBanner').classList.add('flex');
      setFormTexts();
      showTab('order');
    }).catch(function (e) { loading(false); popup(e.message); });
  });
}
function cancelEdit() { clearForm(); showTab('orders'); }
function validate(p) {
  if (p.mode === 'resubmit') return p.orderNo ? null : t('Enter Order No for resubmit.', 'রিসাবমিটের জন্য অর্ডার নম্বর দিন।');
  if (!p.deliveryAt) return t('Delivery Date is required.', 'ডেলিভারির তারিখ দিন।');
  if (!normMobile(p.mobile)) return t('Valid Mobile Number is required.', 'সঠিক মোবাইল নম্বর দিন।');
  if (!p.clientName.trim()) return t('Client or Project Name is required.', 'ক্লায়েন্ট বা প্রজেক্টের নাম দিন।');
  if (!p.address.trim()) return t('Address is required.', 'ঠিকানা দিন।');
  if (!p.orderBy) return t('Order By is required.', 'Order By নির্বাচন করুন।');
  for (var i = 0; i < p.items.length; i++) {
    var it = p.items[i], n = i + 1;
    if (!it.productName || (S.app.productNameList.indexOf(it.productName) === -1 && it.productName !== it.orig)) return t('Please choose a valid product for row ' + n, 'সারি ' + n + ' এ তালিকা থেকে সঠিক প্রোডাক্ট নির্বাচন করুন');
    if (!it.unit) return t('Please select unit for row ' + n, 'সারি ' + n + ' এ ইউনিট নির্বাচন করুন');
    if (!it.packSize) return t('Please select pack size for row ' + n, 'সারি ' + n + ' এ প্যাক সাইজ নির্বাচন করুন');
    if (!Number(it.quantity) || Number(it.quantity) <= 0) return t('Quantity must be greater than 0 for row ' + n, 'সারি ' + n + ' এ পরিমাণ ০ এর বেশি হতে হবে');
  }
  return null;
}
function bgFinish(res, sendSms) {
  var label = res.orderNo;
  var p = res.bg === 'sync' ? gsRetry(['syncOrderBackground', res.orderNo], 0) : gsRetry(['finishOrderBackground', res.orderNo, sendSms], 0);
  p.then(function (r) {
    S.cache = {}; S.dataVer = '';
    var bad = [];
    if (r.pdfError) bad.push('PDF');
    if (r.smsStatus && r.smsStatus.indexOf('Sent') === -1 && r.smsStatus !== 'SMS Off') bad.push('SMS: ' + r.smsStatus);
    if (r.syncStatus === 'failed') bad.push(t('Destination Sync', 'ডেস্টিনেশন সিঙ্ক'));
    if (bad.length) toast(label + ' ⚠ ' + bad.join(', '), 'error');
    else toast(label + ' ✅ ' + t('PDF, SMS & sheet sync done', 'PDF, SMS ও শিট সিঙ্ক সম্পন্ন'), 'success');
    if (S.tab === 'orders') loadOrders(); else if (S.tab === 'dash') renderDash();
  }).catch(function (e) { toast(label + ': ' + e.message, 'error'); });
}
function submit() {
  var resub = isResub();
  var payload = {
    mode: resub ? 'resubmit' : 'new', orderNo: resub ? $('resubmitNo').value.trim() : (S.edit ? S.edit.orderNo : ''),
    deliveryAt: ($('deliveryDate').value ? $('deliveryDate').value + ($('deliveryTime').value ? ' ' + $('deliveryTime').value : '') : ''),
    mobile: $('mobile').value, clientName: $('clientName').value, address: $('address').value, items: rowsData(),
    transportFee: $('transportFee').value, scsTransportCost: $('scsTransportCost').value, orderBy: $('orderBy').value, commissionHolderName: $('commissionHolder').value
  };
  var err = validate(payload);
  if (err) { popup(err); return; }
  loading(true); $('submitBtn').disabled = true;
  var wasEdit = !!S.edit, call;
  if (S.edit) { payload.sheetName = S.edit.sheetName; call = gsq('updateOrder', payload, S.edit.pin); }
  else call = gsq('submitOrder', payload);
  call.then(function (res) {
    loading(false); $('submitBtn').disabled = false;
    if (!res.ok) { popup(res.error || t('Submit failed.', 'সাবমিট হয়নি।')); return; }
    toast((wasEdit ? '✏️ ' + t('Order updated: ', 'অর্ডার আপডেট হয়েছে: ') : '✅ ' + t('Order submitted: ', 'অর্ডার সাবমিট হয়েছে: ')) + res.orderNo, 'success');
    clearForm(); S.cache = {};
    if (res.bg) bgFinish(res, wasEdit ? res.needSms : true);
    if (wasEdit) showTab('orders');
  }).catch(function (e) { loading(false); $('submitBtn').disabled = false; popup(e.message); });
}
var mobTimer = null;
function onMobile() {
  var raw = $('mobile').value, d = raw.replace(/\D/g, '').replace(/^880/, '').replace(/^0/, ''), box = $('mobileAC');
  box.classList.add('hidden'); box.innerHTML = '';
  clearTimeout(mobTimer);
  if (d.length < 4) return;
  mobTimer = setTimeout(function () {
    gs('searchClientByMobile', raw).then(function (res) {
      if (!res.ok || !res.results.length || $('mobile').value !== raw) return;
      box.innerHTML = '<div class="px-3 py-1.5 text-[10px] font-bold text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/30">' + t('Previous orders - tap to autofill', 'আগের অর্ডার - ট্যাপ করলে অটোফিল হবে') + '</div>' +
        res.results.map(function (it, i) { return '<div data-act="pickClient" data-i="' + i + '" class="px-3 py-2 text-xs cursor-pointer hover:bg-pink-50 dark:hover:bg-slate-700 border-b border-slate-100 dark:border-slate-700"><div class="flex justify-between gap-2"><b class="truncate">' + esc(it.clientName) + '</b><span class="text-slate-500 shrink-0">0' + esc(it.mobile.slice(3)) + '</span></div><div class="text-[10px] text-slate-500 truncate">' + esc(it.address) + '</div><div class="text-[10px] text-pink-600 dark:text-pink-400">' + it.orders + ' ' + t('orders', 'অর্ডার') + ' · ' + t('last', 'সর্বশেষ') + ' ' + esc(it.last) + '</div></div>'; }).join('');
      box._res = res.results; box.classList.remove('hidden');
    }).catch(function () {});
  }, 300);
}
function uploadAllPdfs() {
  popup(t('Generate and upload PDF for all orders?', 'সব অর্ডারের PDF তৈরি করে আপলোড করবেন?'), { confirm: true }).then(function (ok) {
    if (!ok) return;
    toast(t('PDF upload started in background...', 'PDF আপলোড ব্যাকগ্রাউন্ডে শুরু হয়েছে...'), 'info'); loading(true);
    gs('generateAndUploadAllOrderPdfs').then(function (r) { loading(false); popup(r.message || (t('Uploaded ', 'আপলোড হয়েছে ') + r.created + ' PDF')); S.cache = {}; })
      .catch(function (e) { loading(false); popup(e.message); });
  });
}

/* ------------------------------------------------------------------ orders data */
function sheetFor(y, m) {
  var ym = String(y) + String(m).padStart(2, '0');
  var arch = MONTHS_EN[m - 1].toUpperCase() + ' ' + y;
  var cur = new Date(), curYm = String(cur.getFullYear()) + String(cur.getMonth() + 1).padStart(2, '0');
  return { sheetName: (ym !== curYm && (S.app.availableSheets || []).indexOf(arch) > -1) ? arch : 'SCS Order', yearMonth: ym };
}
function parseOrders(data) {
  var H = data.headers || [], ix = function (n) { return H.indexOf(n); };
  var I = { no: ix('Order No'), cl: ix('Client or Project name'), mo: ix('Mobile number'), ad: ix('Address'), de: ix('Delivery Time & Date'), pr: ix('Product Name'), q: ix('Quantity'), un: ix('Unit'), pk: ix('Pack Size'), up: ix('Unit Price'), dp: ix('Discount Unit Price'), to: ix('Total Price'), sp: ix('Special Price'), tr: ix('Transport Fee'), st: ix('SCS Transport Cost'), sms: ix('SMS Status'), pdf: ix('PDF Status'), ch: ix('Commission Holder Name'), tc: ix('Total Commission'), ob: ix('Order By'), ts: ix('Timestamp') };
  var g = {};
  (data.rows || []).forEach(function (r) {
    var no = String(r[I.no] || '').trim(); if (!no) return;
    if (!g[no]) g[no] = { orderNo: no, sheet: data.sheetName, client: r[I.cl] || '', mobile: r[I.mo] || '', address: r[I.ad] || '', delivery: r[I.de] || '', transport: Number(r[I.tr] || 0), scsT: r[I.st] || 0, sms: r[I.sms] || 'Pending', pdf: r[I.pdf] || 'Not Uploaded', orderBy: r[I.ob] || '', holder: r[I.ch] || '', ts: String(r[I.ts] || ''), items: [] };
    var q = Number(r[I.q] || 0), u = Number(r[I.up] || 0), d = Number(r[I.dp] || 0), ct = q * u, cs = q * d;
    g[no].items.push({ name: r[I.pr] || '', qty: q, unit: r[I.un] || '', pack: r[I.pk] || '', up: u, dp: d, total: ct > 0 ? ct : Number(r[I.to] || 0), special: cs > 0 ? cs : Number(r[I.sp] || 0), comm: Number(r[I.tc] || 0) });
  });
  return Object.keys(g).map(function (k) {
    var o = g[k], s = function (f) { return o.items.reduce(function (a, i) { return a + f(i); }, 0); };
    o.gross = s(function (i) { return i.total; }); o.spc = s(function (i) { return i.special; }); o.disc = Math.max(0, o.gross - o.spc);
    o.net = o.spc + o.transport; o.comm = s(function (i) { return i.comm; }); o.qty = s(function (i) { return i.qty; });
    var mk = (data.edited || {})[o.orderNo] || null;
    o.edited = mk ? mk.et : ''; o.eCount = mk ? mk.e : 0; o.tCount = mk ? mk.t : 0; o.tcRecent = mk ? mk.tt : '';
    o.hay = [o.orderNo, o.client, o.mobile, o.address, o.orderBy, o.holder, o.delivery, o.ts].concat(o.items.map(function (i) { return i.name; })).join(' ').toLowerCase();
    return o;
  }).sort(function (a, b) { return String(b.orderNo).localeCompare(String(a.orderNo)); });
}
function loadMonth(y, m, cb) {
  var key = String(y) + String(m).padStart(2, '0'), c = S.cache[key];
  if (c) cb(c, true);
  var sf = sheetFor(y, m);
  loading(true);
  return gs('getSummary', sf).then(function (d) {
    loading(false);
    S.dataVer = S.dataVer || ''; 
    if (c && c.ver === d.lastUpdated) return;
    var n = { ver: d.lastUpdated, orders: parseOrders(d) };
    S.cache[key] = n; cb(n, false);
  }).catch(function (e) { loading(false); toast(e.message, 'error'); });
}

/* ------------------------------------------------------------------ DASHBOARD */
function kpi(val, lbl, color, sub) {
  var c = { pink: 'from-pink-500/10 to-purple-500/10 border-pink-200 dark:border-pink-900/50 text-pink-600 dark:text-pink-400', blue: 'from-blue-500/10 to-indigo-500/10 border-blue-200 dark:border-blue-900/50 text-blue-600 dark:text-blue-400', emerald: 'from-emerald-500/10 to-teal-500/10 border-emerald-200 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400', amber: 'from-amber-500/10 to-orange-600/10 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400', rose: 'from-rose-500/10 to-amber-500/10 border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400', purple: 'from-purple-500/10 to-pink-500/10 border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400' }[color];
  return '<div class="p-3 rounded-2xl bg-gradient-to-br border ' + c + '"><div class="text-[10px] font-bold uppercase">' + lbl + '</div><div class="text-base sm:text-lg font-black mt-1 text-slate-900 dark:text-slate-100">' + val + '</div>' + (sub ? '<div class="text-[10px] mt-0.5 font-semibold">' + sub + '</div>' : '') + '</div>';
}
function delta(cur, prev) {
  if (!prev) return '';
  var d = Math.round((cur - prev) / prev * 100);
  return (d >= 0 ? '▲ ' : '▼ ') + Math.abs(d) + '% ' + t('vs last month', 'গত মাসের তুলনায়');
}
function bars(rows, fmtv) {
  var max = Math.max.apply(null, rows.map(function (r) { return r.v; }).concat([1]));
  return rows.map(function (r) { return '<div class="flex items-center gap-2 text-[11px]"><div class="w-24 sm:w-32 truncate font-semibold">' + esc(r.l) + '</div><div class="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div class="h-full rounded-full bg-pink-600" style="width:' + Math.max(3, Math.round(r.v / max * 100)) + '%"></div></div><div class="w-20 text-right font-bold">' + fmtv(r.v) + '</div></div>'; }).join('');
}
function sumBy(os, f) { return os.reduce(function (a, o) { return a + f(o); }, 0); }
function tbl(heads, rows) {
  return '<div class="overflow-x-auto custom-scrollbar rounded-xl border border-slate-200 dark:border-slate-700"><table class="w-full text-[11px]"><thead class="bg-slate-100 dark:bg-slate-800 font-bold"><tr>' + heads.map(function (h, i) { return '<th class="py-1.5 px-2 ' + (i ? 'text-right' : 'text-left') + ' whitespace-nowrap">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
    (rows.length ? rows.map(function (r) { return '<tr class="border-t border-slate-100 dark:border-slate-800">' + r.map(function (c, i) { return '<td class="py-1.5 px-2 ' + (i ? 'text-right' : 'font-semibold') + '">' + c + '</td>'; }).join('') + '</tr>'; }).join('') : '<tr><td colspan="' + heads.length + '" class="py-3 text-center text-slate-500">—</td></tr>') + '</tbody></table></div>';
}
function h3(txt) { return '<div class="text-xs font-extrabold mt-4 mb-1.5">' + txt + '</div>'; }
function sellerTbl(rows) { return tbl([t('Seller / Marketer', 'সেলার / মার্কেটার'), t('Orders', 'অর্ডার'), t('Qty', 'পরিমাণ'), t('Sales', 'বিক্রি'), t('Commission', 'কমিশন')], rows.map(function (r) { return [esc(r.name), r.orders, fmt(r.qty), '৳' + fmt(r.sales), '৳' + fmt(r.comm)]; })); }
function productTbl(rows) { return tbl([t('Product', 'প্রোডাক্ট'), t('Qty', 'পরিমাণ'), t('Sales', 'বিক্রি'), t('Orders', 'অর্ডার')], rows.map(function (r) { return [esc(r.name) + (r.unit ? ' <span class="text-slate-500 font-normal">(' + esc(r.unit) + ')</span>' : ''), fmt(r.qty), '৳' + fmt(r.sales), r.orders]; })); }
function aggOrders(os) {
  var se = {}, pr = {};
  os.forEach(function (o) {
    var sn = o.orderBy || 'Unknown', s = se[sn] = se[sn] || { name: sn, orders: 0, qty: 0, sales: 0, comm: 0 };
    s.orders++; s.qty += o.qty; s.sales += o.net; s.comm += o.comm;
    var seen = {};
    o.items.forEach(function (i) { if (!i.name) return; var p = pr[i.name] = pr[i.name] || { name: i.name, unit: i.unit, qty: 0, sales: 0, orders: 0 }; p.qty += i.qty; p.sales += i.special; if (!seen[i.name]) { seen[i.name] = 1; p.orders++; } });
  });
  var byS = function (a, b) { return b.sales - a.sales; };
  return { sellers: Object.keys(se).map(function (k) { return se[k]; }).sort(byS), products: Object.keys(pr).map(function (k) { return pr[k]; }).sort(byS) };
}
function renderDash() {
  var now = new Date(), y = now.getFullYear(), m = now.getMonth() + 1;
  if (!S.dy) { S.dy = y; S.dm = m; }
  if (!$('dToday')) {
    var sk = '<div class="text-xs text-slate-500 py-6 text-center">…</div>';
    $('viewDash').innerHTML = '<div class="space-y-3"><div id="dToday" class="' + K.card + '">' + sk + '</div><div id="dMonth" class="' + K.card + '">' + sk + '</div><div id="dTotal" class="' + K.card + '">' + sk + '</div></div>';
  }
  loadMonth(y, m, function (n) { if (S.tab === 'dash' && $('dToday')) drawToday(n.orders); });
  loadDashMonth(); loadStats();
}
function loadDashMonth() { loadMonth(S.dy, S.dm, function (n) { if (S.tab === 'dash' && $('dMonth')) drawMonth(n.orders); }); }
function drawToday(all) {
  var now = new Date(), today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  var os = all.filter(function (o) { return o.ts.slice(0, 10) === today; }), ag = aggOrders(os);
  var list = os.map(function (o) { return '<div class="flex items-center justify-between gap-2 py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0"><div class="min-w-0"><div class="text-xs font-bold truncate">' + esc(o.client) + ' ' + editedBadge(o) + '</div><div class="text-[10px] text-slate-500 truncate">' + esc(o.orderNo) + ' · ' + esc(o.orderBy) + ' · ' + esc(o.items.map(function (i) { return i.name + ' ' + fmt(i.qty); }).join(', ')) + '</div></div><div class="text-xs font-black text-emerald-600 dark:text-emerald-400 shrink-0">৳' + fmt(o.net) + '</div></div>'; }).join('') || '<div class="text-xs text-slate-500 py-3 text-center">' + t('No orders today.', 'আজ এখনো কোনো অর্ডার নেই।') + '</div>';
  $('dToday').innerHTML = '<div class="flex items-center justify-between mb-3"><div class="text-sm font-extrabold">☀️ ' + t('Today', 'আজ') + '</div><div class="text-[11px] text-slate-500">' + today + '</div></div>' +
    '<div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5">' + kpi(os.length, t('Orders', 'অর্ডার'), 'pink') + kpi('৳' + fmt(sumBy(os, function (o) { return o.net; })), t('Net Sales', 'নীট বিক্রি'), 'emerald') + kpi(fmt(sumBy(os, function (o) { return o.qty; })), t('Total Qty', 'মোট পরিমাণ'), 'blue') + kpi('৳' + fmt(sumBy(os, function (o) { return o.gross; })), t('Total Price', 'মোট মূল্য'), 'purple') +
    kpi('৳' + fmt(sumBy(os, function (o) { return o.disc; })), t('Discount', 'ডিসকাউন্ট'), 'rose') + kpi('৳' + fmt(sumBy(os, function (o) { return o.comm; })), t('Commission', 'কমিশন'), 'amber') + kpi('৳' + fmt(sumBy(os, function (o) { return o.transport; })), t('Transport Fee', 'ট্রান্সপোর্ট ফি'), 'purple') + kpi('৳' + fmt(sumBy(os, function (o) { return Number(o.scsT || 0); })), t('SCS Transport Cost', 'এসসিএস ট্রান্সপোর্ট খরচ'), 'blue') + '</div>' +
    h3(t('Seller-wise', 'সেলার ভিত্তিক')) + sellerTbl(ag.sellers) + h3(t('Product-wise', 'প্রোডাক্ট ভিত্তিক')) + productTbl(ag.products) + h3(t("Today's Orders", 'আজকের অর্ডার')) + '<div>' + list + '</div>';
}
function drawMonth(os) {
  var y = S.dy, m = S.dm, ag = aggOrders(os), days = new Date(y, m, 0).getDate(), perDay = [], now = new Date();
  for (var i = 0; i < days; i++) perDay.push(0);
  os.forEach(function (o) { var d = parseInt(o.ts.slice(8, 10), 10); if (d >= 1 && d <= days) perDay[d - 1] += o.net; });
  var mx = Math.max.apply(null, perDay.concat([1])), isCur = y === now.getFullYear() && m === now.getMonth() + 1;
  var pend = os.filter(function (o) { return String(o.sms).indexOf('Sent') === -1 && o.sms !== 'SMS Off'; }).length, nopdf = os.filter(function (o) { return o.pdf !== 'Pdf Uploaded'; }).length;
  $('dMonth').innerHTML = '<div class="flex items-center justify-between gap-2 mb-3"><div class="text-sm font-extrabold">📅 ' + t('Month Report', 'মাসের রিপোর্ট') + '</div><div class="flex items-center gap-1"><button type="button" data-act="dmPrev" class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 cursor-pointer">' + ic('left', 'w-4 h-4') + '</button><span class="px-2 text-xs font-extrabold text-pink-600 dark:text-pink-400 min-w-[7rem] text-center">' + (S.lang === 'bn' ? MONTHS_BN : MONTHS_EN)[m - 1] + ' ' + y + '</span><button type="button" data-act="dmNext" class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 cursor-pointer">' + ic('right', 'w-4 h-4') + '</button><button type="button" data-act="printSummary" class="ml-1 btn-p ' + K.green + ' !py-1.5">' + ic('print', 'w-3.5 h-3.5') + '</button></div></div>' +
    '<div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5">' + kpi(os.length, t('Orders', 'অর্ডার'), 'pink') + kpi('৳' + fmt(sumBy(os, function (o) { return o.net; })), t('Net Sales', 'নীট বিক্রি'), 'emerald') + kpi(fmt(sumBy(os, function (o) { return o.qty; })), t('Total Qty', 'মোট পরিমাণ'), 'blue') + kpi('৳' + fmt(sumBy(os, function (o) { return o.gross; })), t('Total Price', 'মোট মূল্য'), 'purple') +
    kpi('৳' + fmt(sumBy(os, function (o) { return o.disc; })), t('Discount', 'ডিসকাউন্ট'), 'rose') + kpi('৳' + fmt(sumBy(os, function (o) { return o.comm; })), t('Commission', 'কমিশন'), 'amber') + kpi('৳' + fmt(sumBy(os, function (o) { return o.transport; })), t('Transport Fee', 'ট্রান্সপোর্ট ফি'), 'purple') + kpi('৳' + fmt(sumBy(os, function (o) { return Number(o.scsT || 0); })), t('SCS Transport Cost', 'এসসিএস ট্রান্সপোর্ট খরচ'), 'blue') +
    kpi(fmt(sumBy(os, function (o) { return o.net; }) - sumBy(os, function (o) { return o.comm; })), t('Net Money Left', 'নীট অবশিষ্ট'), 'emerald') + kpi(pend, t('SMS Pending', 'এসএমএস পেন্ডিং'), 'amber') + kpi(nopdf, t('PDF Pending', 'PDF পেন্ডিং'), 'blue') + '</div>' +
    h3(t('Daily Sales', 'দৈনিক বিক্রি')) + '<div class="flex items-end gap-[3px] h-24">' + perDay.map(function (v, i) { return '<div class="flex-1 rounded-t ' + (isCur && i + 1 === now.getDate() ? 'bg-pink-600' : 'bg-pink-300 dark:bg-pink-900') + '" style="height:' + Math.max(2, Math.round(v / mx * 100)) + '%" title="' + (i + 1) + ': ৳' + fmt(v) + '"></div>'; }).join('') + '</div><div class="flex justify-between text-[10px] text-slate-500 mt-1"><span>1</span><span>' + Math.round(days / 2) + '</span><span>' + days + '</span></div>' +
    h3(t('Seller-wise', 'সেলার ভিত্তিক')) + sellerTbl(ag.sellers) + h3(t('Product-wise', 'প্রোডাক্ট ভিত্তিক')) + productTbl(ag.products);
}
function loadStats() {
  var draw = function () { if (S.tab === 'dash' && $('dTotal')) drawTotal(); };
  if (S.stats) draw();
  gs('getAllStats').then(function (r) { S.stats = r; draw(); }).catch(function (e) { toast(e.message, 'error'); });
}
function drawTotal() {
  var st = S.stats, tot = st.total, names = S.lang === 'bn' ? MONTHS_BN : MONTHS_EN;
  var mx = Math.max.apply(null, st.months.map(function (x) { return x.sales; }).concat([1]));
  var open = S.statOpen || (st.months[0] && st.months[0].ym);
  var rows = st.months.map(function (x) {
    var y = x.ym.slice(0, 4), mo = Number(x.ym.slice(4)), isOpen = open === x.ym, dayRows = '';
    if (isOpen) {
      dayRows = Object.keys(st.days).filter(function (d) { return d.slice(0, 7) === y + '-' + x.ym.slice(4); }).sort().reverse().map(function (d) { var v = st.days[d]; return '<div class="grid grid-cols-4 gap-1 text-[11px] py-1 border-t border-slate-100 dark:border-slate-800"><span class="font-semibold">' + d.slice(8) + '/' + d.slice(5, 7) + '</span><span class="text-center">' + v.o + ' ' + t('ord', 'অর্ডার') + '</span><span class="text-center">' + fmt(v.q) + '</span><span class="text-right font-bold text-emerald-600 dark:text-emerald-400">৳' + fmt(v.s) + '</span></div>'; }).join('');
      dayRows = '<div class="mt-2 px-1"><div class="grid grid-cols-4 gap-1 text-[10px] font-bold uppercase text-slate-500 pb-1"><span>' + t('Day', 'দিন') + '</span><span class="text-center">' + t('Orders', 'অর্ডার') + '</span><span class="text-center">' + t('Qty', 'পরিমাণ') + '</span><span class="text-right">' + t('Sales', 'বিক্রি') + '</span></div>' + dayRows + '</div>';
    }
    return '<div class="rounded-xl border border-slate-200 dark:border-slate-700 p-2.5"><button type="button" data-act="statMonth" data-ym="' + x.ym + '" class="w-full text-left cursor-pointer"><div class="flex items-center justify-between"><span class="text-xs font-extrabold">' + names[mo - 1] + ' ' + y + '</span><span class="text-xs font-black text-emerald-600 dark:text-emerald-400">৳' + fmt(x.sales) + '</span></div>' +
      '<div class="h-1.5 mt-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div class="h-full rounded-full bg-pink-600" style="width:' + Math.max(2, Math.round(x.sales / mx * 100)) + '%"></div></div>' +
      '<div class="flex flex-wrap gap-x-3 text-[10px] text-slate-500 mt-1"><span>' + x.orders + ' ' + t('orders', 'অর্ডার') + '</span><span>' + t('Qty', 'পরিমাণ') + ' ' + fmt(x.qty) + '</span><span>' + t('Commission', 'কমিশন') + ' ৳' + fmt(x.comm) + '</span><span>' + t('Transport', 'ট্রান্সপোর্ট') + ' ৳' + fmt(x.transport) + '</span></div></button>' + dayRows + '</div>';
  }).join('');
  $('dTotal').innerHTML = '<div class="text-sm font-extrabold mb-3">📈 ' + t('Total (Lifetime)', 'সর্বমোট (লাইফটাইম)') + '</div><div class="grid grid-cols-2 lg:grid-cols-5 gap-2.5">' + kpi(tot.orders, t('Total Orders', 'মোট অর্ডার'), 'pink') + kpi('৳' + fmt(tot.sales), t('Total Sales', 'মোট বিক্রি'), 'emerald') + kpi(fmt(tot.qty), t('Total Qty', 'মোট পরিমাণ'), 'blue') + kpi('৳' + fmt(tot.comm), t('Commission', 'কমিশন'), 'amber') + kpi('৳' + fmt(tot.transport), t('Transport', 'ট্রান্সপোর্ট'), 'purple') + '</div>' +
    h3(t('Seller-wise (Marketers)', 'সেলার ভিত্তিক (মার্কেটার)')) + sellerTbl(st.sellers || []) + h3(t('Product-wise', 'প্রোডাক্ট ভিত্তিক')) + productTbl(st.products || []) +
    h3(t('Month-wise & Day-wise (tap a month)', 'মাস ও দিন ভিত্তিক (মাসে ট্যাপ করুন)')) + '<div class="space-y-2">' + (rows || '<div class="text-xs text-slate-500">—</div>') + '</div>';
}
/* ------------------------------------------------------------------ ALL ORDERS */
function buildMonthSel() {
  var ms = $('monthSel'), ys = $('yearSel'); if (!ms) return;
  ms.innerHTML = (S.lang === 'bn' ? MONTHS_BN : MONTHS_EN).map(function (n, i) { return '<option value="' + (i + 1) + '"' + (i + 1 === S.m ? ' selected' : '') + '>' + n + '</option>'; }).join('');
  var cy = new Date().getFullYear(), h = '';
  for (var y = cy - 5; y <= cy + 1; y++) h += '<option value="' + y + '"' + (y === S.y ? ' selected' : '') + '>' + y + '</option>';
  ys.innerHTML = h;
}
function moveMonth(d) { S.m += d; if (S.m < 1) { S.m = 12; S.y--; } if (S.m > 12) { S.m = 1; S.y++; } buildMonthSel(); loadOrders(); }
function buildFilters() {
  var vm = [['cards', 'grid', 'Cards', 'কার্ড'], ['list', 'list', 'List', 'লিস্ট'], ['table', 'table', 'Table', 'টেবিল'], ['time', 'tl', 'Timeline', 'টাইমলাইন']];
  $('viewModes').innerHTML = vm.map(function (v) { return '<button type="button" title="' + t(v[2], v[3]) + '" data-act="viewMode" data-v="' + v[0] + '" class="p-2 cursor-pointer ' + (S.view === v[0] ? 'bg-pink-600 text-white' : 'text-slate-600 dark:text-slate-300') + '">' + ic(v[1], 'w-4 h-4') + '</button>'; }).join('');
  var sel = $('fSeller'), cur = S.seller;
  sel.innerHTML = '<option value="">' + t('All sellers', 'সব সেলার') + '</option>' + (S.app.orderByList || []).map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + '</option>'; }).join('');
  sel.value = cur; buildMonthSel();
}
function loadOrders() {
  buildMonthSel();
  loadMonth(S.y, S.m, function (n) { if (S.tab === 'orders') { S.cur = n.orders; S.limit = 40; renderOrders(); } });
}
function monthSummaryHtml(os) {
  if (!os.length) return '';
  var sum = function (f) { return os.reduce(function (a, o) { return a + f(o); }, 0); };
  var ps = {}, pe = {};
  os.forEach(function (o) {
    o.items.forEach(function (i) { var n = String(i.name || '').trim(); if (!n) return; ps[n] = ps[n] || { q: 0, u: i.unit || 'pcs' }; ps[n].q += i.qty; });
    var p = String(o.orderBy || '').trim() || 'Unknown'; pe[p] = pe[p] || { q: 0, o: 0 }; pe[p].q += o.qty; pe[p].o++;
  });
  var net = sum(function (o) { return o.net; }) - sum(function (o) { return o.comm; });
  var prodHtml = Object.keys(ps).sort().map(function (n) { return mini(fmt(ps[n].q) + ' ' + esc(ps[n].u), esc(n)); }).join('');
  var persHtml = Object.keys(pe).sort().map(function (n) { return mini(fmt(pe[n].q), esc(n) + ' <span class="text-slate-500">(' + pe[n].o + ')</span>'); }).join('');
  return '<div class="' + K.card + '"><div class="flex items-center justify-between"><button type="button" data-act="toggleSum" class="flex items-center gap-1.5 text-xs font-extrabold cursor-pointer">' + ic('down', 'w-4 h-4') + t('Month Summary', 'মাসের সামারি') + ' · ' + os.length + ' ' + t('orders', 'অর্ডার') + ' · ৳' + fmt(sum(function (o) { return o.net; })) + '</button><button type="button" data-act="printSummary" class="btn-p ' + K.green + '">' + ic('print', 'w-3.5 h-3.5') + t('Print', 'প্রিন্ট') + '</button></div>' +
    '<div id="sumBody" class="' + (S.sumOpen ? '' : 'hidden') + ' mt-3"><div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">' + kpi(os.length, t('Total Orders', 'মোট অর্ডার'), 'pink') + kpi(fmt(sum(function (o) { return o.qty; })), t('Total Qty', 'মোট পরিমাণ'), 'blue') + kpi('৳' + fmt(sum(function (o) { return o.spc; })), t('Total Sales', 'মোট বিক্রি'), 'emerald') + kpi('৳' + fmt(sum(function (o) { return o.comm; })), t('Total Commission', 'মোট কমিশন'), 'amber') + kpi('৳' + fmt(sum(function (o) { return o.transport; })), t('Total Transport', 'মোট ট্রান্সপোর্ট'), 'purple') + kpi('৳' + fmt(net), t('Net Money Left', 'নীট অবশিষ্ট'), 'rose') + '</div>' +
    '<h4 class="text-xs font-bold mt-4 mb-2">' + t('Individual Product Sales', 'প্রোডাক্ট ভিত্তিক বিক্রি') + '</h4><div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">' + prodHtml + '</div>' +
    '<h4 class="text-xs font-bold mt-4 mb-2">' + t('Individual Person Sales', 'ব্যক্তি ভিত্তিক বিক্রি') + '</h4><div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">' + persHtml + '</div></div></div>';
}
function mini(val, lbl) { return '<div class="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-center text-[11px] leading-tight"><b class="block text-xs text-slate-900 dark:text-slate-100">' + val + '</b>' + lbl + '</div>'; }
function statusBadge(o) {
  var ok = String(o.sms).indexOf('Sent') > -1;
  return '<span class="px-1.5 py-0.5 rounded-md text-[9px] font-bold ' + (ok ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300') + '">SMS ' + esc(o.sms) + '</span> <span class="px-1.5 py-0.5 rounded-md text-[9px] font-bold ' + (o.pdf === 'Pdf Uploaded' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300') + '">PDF</span>';
}
function iconBtn(act, o, cls, title, ico) {
  return '<button type="button" title="' + title + '" data-act="' + act + '" data-no="' + esc(o.orderNo) + '" data-sheet="' + esc(o.sheet) + '" class="p-1.5 rounded-lg ' + cls + ' cursor-pointer active:scale-95 transition-all">' + ic(ico, 'w-3.5 h-3.5') + '</button>';
}
function icons(o, view) {
  return '<span class="inline-flex gap-1 shrink-0">' + (view ? iconBtn('viewOrder', o, 'bg-slate-200 hover:bg-slate-300 text-slate-700 dark:bg-slate-700 dark:text-slate-200', t('View full order', 'পুরো অর্ডার দেখুন'), 'eye') : '') +
    iconBtn('tcOrder', o, 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300', t('Set SCS transport cost (PIN)', 'ট্রান্সপোর্ট খরচ বসান (পিন)'), 'truck') +
    iconBtn('editOrder', o, 'bg-amber-100 hover:bg-amber-200 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300', t('Edit', 'এডিট'), 'edit') +
    iconBtn('printOrder', o, 'bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300', t('Print', 'প্রিন্ট'), 'print') +
    iconBtn('pdfOrder', o, 'bg-rose-100 hover:bg-rose-200 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300', t('Download PDF', 'PDF ডাউনলোড'), 'download') + '</span>';
}
function editedBadge(o) {
  var h = '';
  if (o.eCount) h += o.edited ? '<span class="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-amber-400 text-slate-900" title="' + esc(o.edited) + '">✏ EDITED ×' + o.eCount + ' · ' + esc(o.edited) + '</span>' : '<span class="px-1.5 py-0.5 rounded-md text-[9px] font-bold border border-amber-400 text-amber-600 dark:text-amber-300">✏ ×' + o.eCount + '</span>';
  if (o.tCount) h += ' ' + (o.tcRecent ? '<span class="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-emerald-500 text-white" title="' + esc(o.tcRecent) + '">🚚 ৳' + fmt(o.scsT) + ' ×' + o.tCount + ' · ' + esc(o.tcRecent) + '</span>' : '<span class="px-1.5 py-0.5 rounded-md text-[9px] font-bold border border-emerald-500 text-emerald-600 dark:text-emerald-300">🚚 ×' + o.tCount + '</span>');
  return h;
}
function detailHtml(o) {
  var row = function (l, v) { return '<div class="text-xs"><span class="font-bold text-slate-600 dark:text-slate-300">' + l + ':</span> ' + v + '</div>'; };
  var th = 'border border-slate-800 dark:border-slate-400 py-1.5 px-2 text-left', td = 'border border-slate-800 dark:border-slate-400 py-1 px-2';
  return '<div class="pt-3 mt-3 border-t border-slate-200 dark:border-slate-800"><div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mb-3">' +
    row(t('Created', 'তৈরি'), esc(o.ts)) + row(t('Delivery', 'ডেলিভারি'), esc(o.delivery)) + row(t('Mobile', 'মোবাইল'), esc(o.mobile)) + row(t('Address', 'ঠিকানা'), esc(o.address)) +
    row(t('Order By', 'অর্ডার নিয়েছেন'), esc(o.orderBy)) + row(t('Commission Holder', 'কমিশন হোল্ডার'), esc(o.holder)) +
    row(t('Transport Fee', 'ট্রান্সপোর্ট ফি'), '৳' + fmt(o.transport) + ' | <b>' + t('SCS Transport Cost', 'এসসিএস ট্রান্সপোর্ট খরচ') + ':</b> ' + (o.tcRecent ? '<b class="px-1 rounded bg-emerald-200 text-emerald-900">৳' + fmt(o.scsT) + '</b>' : '৳' + fmt(o.scsT)) + (o.tCount ? ' <span class="text-[10px] text-slate-500">(×' + o.tCount + ')</span>' : '')) + row('Status', statusBadge(o)) + '</div>' +
    '<div class="overflow-x-auto custom-scrollbar border border-slate-800 dark:border-slate-400"><table class="w-full border-collapse text-[11px] font-sans print-table"><thead><tr class="bg-slate-100 dark:bg-slate-800 font-bold whitespace-nowrap">' +
    ['SL', t('Product', 'প্রোডাক্ট'), t('Pack', 'প্যাক'), t('Qty', 'পরিমাণ'), t('Unit', 'ইউনিট'), t('Unit Price', 'ইউনিট প্রাইস'), t('Discount Price', 'ডিসকাউন্ট প্রাইস'), t('Total', 'মোট'), t('Special', 'স্পেশাল'), t('Commission', 'কমিশন')].map(function (h) { return '<th class="' + th + '">' + h + '</th>'; }).join('') + '</tr></thead><tbody class="font-medium">' +
    o.items.map(function (i, n) { return '<tr><td class="' + td + ' text-center">' + (n + 1) + '</td><td class="' + td + '">' + esc(i.name) + '</td><td class="' + td + '">' + esc(i.pack) + '</td><td class="' + td + '">' + fmt(i.qty) + '</td><td class="' + td + '">' + esc(i.unit) + '</td><td class="' + td + ' text-right">৳' + fmt(i.up) + '</td><td class="' + td + ' text-right">৳' + fmt(i.dp) + '</td><td class="' + td + ' text-right">৳' + fmt(i.total) + '</td><td class="' + td + ' text-right">৳' + fmt(i.special) + '</td><td class="' + td + ' text-right">৳' + fmt(i.comm) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
    '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">' + mini('৳' + fmt(o.disc), t('Discount', 'ডিসকাউন্ট')) + mini('৳' + fmt(o.transport), t('Transport Fee', 'ট্রান্সপোর্ট ফি')) + mini('৳' + fmt(o.net), t('Net Payable', 'নীট প্রদেয়')) + mini('৳' + fmt(o.comm), t('Commission', 'কমিশন')) + '</div></div>';
}
function wrapOpen(o, inner) {
  var open = S.open[o.orderNo];
  return inner + '<div class="od" data-no="' + esc(o.orderNo) + '">' + (open ? detailHtml(o) : '') + '</div>';
}
function prodChips(o, full) {
  return o.items.map(function (i) { return '<span class="inline-block px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold">' + esc(i.name) + ' · ' + fmt(i.qty) + ' ' + esc(i.unit) + (full && i.pack && i.pack !== NO_PACK ? ' · ' + esc(i.pack) : '') + '</span>'; }).join(' ');
}
function cardHtml(o) {
  return '<div class="' + K.card + ' order-block !p-3' + (o.edited ? ' edited-card' : '') + '">' +
    '<div class="flex items-start justify-between gap-2"><div class="min-w-0"><div class="flex flex-wrap items-center gap-1 text-[11px] font-extrabold text-pink-600 dark:text-pink-400">' + esc(o.orderNo) + ' <span class="text-slate-500 font-medium">· ' + esc(o.ts.slice(0, 10)) + '</span> ' + editedBadge(o) + '</div><div class="text-sm font-extrabold truncate">' + esc(o.client) + '</div>' +
    '<a href="tel:' + esc(o.mobile) + '" class="text-[11px] text-blue-600 dark:text-blue-400 font-semibold">' + esc(o.mobile) + '</a></div>' + icons(o) + '</div>' +
    '<div class="text-[11px] text-slate-500 mt-1 line-clamp-2">' + esc(o.address) + '</div><div class="flex flex-wrap gap-1 mt-1.5">' + prodChips(o) + '</div>' +
    '<div class="flex items-center justify-between mt-2 gap-2"><div>' + statusBadge(o) + '<div class="text-[10px] text-slate-500 mt-0.5">' + esc(o.orderBy) + '</div></div><div class="text-right"><div class="text-[10px] text-slate-500">' + t('Net Payable', 'নীট প্রদেয়') + '</div><div class="text-sm font-black text-emerald-600 dark:text-emerald-400">৳' + fmt(o.net) + '</div></div></div>' +
    '<button type="button" data-act="toggleOrder" data-no="' + esc(o.orderNo) + '" class="w-full mt-1.5 text-[11px] font-bold text-slate-500 flex items-center justify-center gap-1 cursor-pointer">' + ic('down', 'w-3.5 h-3.5') + t('Details', 'বিস্তারিত') + '</button>' + wrapOpen(o, '') + '</div>';
}
function listHtml(o) {
  var kv = function (l, v) { return '<span class="whitespace-nowrap"><b class="text-slate-600 dark:text-slate-300">' + l + ':</b> ' + v + '</span>'; };
  return '<div class="' + K.card + ' order-block !p-2.5' + (o.edited ? ' edited-card' : '') + '"><div class="flex items-center gap-2"><button type="button" data-act="toggleOrder" data-no="' + esc(o.orderNo) + '" class="flex-1 min-w-0 flex items-center gap-1.5 text-left cursor-pointer">' +
    '<span class="text-[11px] font-extrabold text-pink-600 dark:text-pink-400 shrink-0">' + esc(o.orderNo) + '</span><span class="text-xs font-bold truncate">' + esc(o.client) + '</span></button>' + icons(o, true) + '</div>' +
    '<div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-500 mt-1">' + editedBadge(o) + kv(t('Date', 'তারিখ'), esc(o.ts.slice(0, 10))) + kv(t('Mobile', 'মোবাইল'), '<a href="tel:' + esc(o.mobile) + '" class="text-blue-600 dark:text-blue-400">' + esc(o.mobile) + '</a>') + kv(t('Delivery', 'ডেলিভারি'), esc(o.delivery)) + kv(t('By', 'সেলার'), esc(o.orderBy)) + kv(t('Transport', 'ট্রান্সপোর্ট'), '৳' + fmt(o.transport)) + '</div>' +
    '<div class="text-[10px] text-slate-500 mt-0.5">' + esc(o.address) + '</div><div class="flex flex-wrap gap-1 mt-1">' + prodChips(o, true) + '</div>' +
    '<div class="flex items-center justify-between mt-1.5"><div>' + statusBadge(o) + '</div><div class="text-xs font-black text-emerald-600 dark:text-emerald-400">' + t('Net', 'নীট') + ' ৳' + fmt(o.net) + ' <span class="text-[10px] font-semibold text-slate-500">(' + t('Qty', 'পরিমাণ') + ' ' + fmt(o.qty) + ')</span></div></div>' + wrapOpen(o, '') + '</div>';
}
function fullHtml(o) {
  return '<div class="' + K.card + ' order-block !p-3' + (o.edited ? ' edited-card' : '') + '"><div class="flex items-start justify-between gap-2"><div class="min-w-0"><div class="flex flex-wrap items-center gap-1 text-[11px] font-extrabold text-pink-600 dark:text-pink-400">' + esc(o.orderNo) + ' ' + editedBadge(o) + '</div><div class="text-sm font-extrabold">' + esc(o.client) + '</div></div>' + icons(o) + '</div>' + detailHtml(o) + '</div>';
}
function tableHtml(os) {
  var th = 'py-2 px-2 text-left whitespace-nowrap', td = 'py-1.5 px-2 border-t border-slate-100 dark:border-slate-800';
  return '<div class="' + K.card + ' !p-0 overflow-x-auto custom-scrollbar"><table class="w-full text-[11px]"><thead class="bg-slate-100 dark:bg-slate-800 font-bold"><tr>' +
    [t('Order No', 'অর্ডার'), t('Date', 'তারিখ'), t('Client', 'ক্লায়েন্ট'), t('Mobile', 'মোবাইল'), t('Products', 'প্রোডাক্ট'), t('Qty', 'পরিমাণ'), t('Net', 'নীট'), t('Seller', 'সেলার'), 'SMS', 'PDF', ''].map(function (h) { return '<th class="' + th + '">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
    os.map(function (o) { return '<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50"><td class="' + td + ' font-extrabold text-pink-600 dark:text-pink-400 whitespace-nowrap">' + esc(o.orderNo) + ' ' + editedBadge(o) + '</td><td class="' + td + ' whitespace-nowrap">' + esc(o.ts.slice(0, 10)) + '</td><td class="' + td + ' font-semibold">' + esc(o.client) + '</td><td class="' + td + '">' + esc(o.mobile) + '</td><td class="' + td + '">' + esc(o.items.map(function (i) { return i.name; }).join(', ')) + '</td><td class="' + td + '">' + fmt(o.qty) + '</td><td class="' + td + ' font-black text-emerald-600 dark:text-emerald-400">৳' + fmt(o.net) + '</td><td class="' + td + '">' + esc(o.orderBy) + '</td><td class="' + td + '">' + esc(o.sms) + '</td><td class="' + td + '">' + (o.pdf === 'Pdf Uploaded' ? '✅' : '—') + '</td><td class="' + td + '">' + icons(o, true) + '</td></tr>'; }).join('') + '</tbody></table></div>';
}
function filtered() {
  var q = S.q.toLowerCase().trim(), os = S.cur.filter(function (o) { return (!q || o.hay.indexOf(q) > -1) && (!S.seller || o.orderBy === S.seller); });
  if (S.sort === 'old') os = os.slice().reverse(); else if (S.sort === 'high') os = os.slice().sort(function (a, b) { return b.net - a.net; });
  return os;
}
function renderOrders() {
  S.ordMap = {}; S.cur.forEach(function (o) { S.ordMap[o.orderNo] = o; });
  var os = filtered(), shown = os.slice(0, S.limit), body = '';
  if (!os.length) body = '<div class="text-center py-14 text-sm text-slate-500">' + t('No orders found.', 'কোনো অর্ডার পাওয়া যায়নি।') + '</div>';
  else if (S.view === 'table') body = tableHtml(shown);
  else if (S.view === 'list') body = '<div class="space-y-2">' + shown.map(listHtml).join('') + '</div>';
  else if (S.view === 'time') {
    var groups = {}, order = [];
    shown.forEach(function (o) { var d = o.ts.slice(0, 10) || '-'; if (!groups[d]) { groups[d] = []; order.push(d); } groups[d].push(o); });
    body = order.map(function (d) { var tot = groups[d].reduce(function (a, o) { return a + o.net; }, 0); return '<div class="mb-4"><div class="sticky top-14 z-10 flex items-center justify-between px-3 py-1.5 mb-2 rounded-xl bg-pink-600 text-white text-xs font-bold"><span>' + esc(d) + '</span><span>' + groups[d].length + ' · ৳' + fmt(tot) + '</span></div><div class="space-y-2 border-l-2 border-pink-300 dark:border-pink-900 pl-2.5">' + groups[d].map(fullHtml).join('') + '</div></div>'; }).join('');
  } else body = '<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">' + shown.map(cardHtml).join('') + '</div>';
  if (os.length > S.limit) body += '<div class="text-center mt-4"><button type="button" data-act="more" class="btn-p ' + K.ghost + '">' + t('Show more', 'আরও দেখুন') + ' (' + (os.length - S.limit) + ')</button></div>';
  $('ordersBody').innerHTML = body;
}
function openPr(no, mode) {
  S.pr = { no: no, mode: mode }; $('prLh').checked = false;
  $('prTitle').textContent = (mode === 'pdf' ? t('Download PDF', 'PDF ডাউনলোড') : t('Print', 'প্রিন্ট')) + ' · ' + no;
  $('prGo').textContent = mode === 'pdf' ? t('Download PDF', 'PDF ডাউনলোড') : t('Print', 'প্রিন্ট');
  $('prModal').classList.remove('hidden');
}
function pdfDownload(no, lh) {
  toast(t('Preparing PDF...', 'PDF তৈরি হচ্ছে...'), 'info'); loading(true);
  gs('downloadOrderPdf', no, !!lh).then(function (r) {
    loading(false);
    if (!r.ok) { popup(r.error || 'PDF failed'); return; }
    var bin = atob(r.data), arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    var url = URL.createObjectURL(new Blob([arr], { type: 'application/pdf' })), a = document.createElement('a');
    a.href = url; a.download = r.name; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }).catch(function (e) { loading(false); popup(e.message); });
}
function openTc(no, sheet, pin) {
  var o = S.ordMap[no]; if (!o) return;
  S.tc = { no: no, sheet: sheet, pin: pin }; $('tcTitle').textContent = t('SCS Transport Cost', 'এসসিএস ট্রান্সপোর্ট খরচ') + ' · ' + no; $('tcVal').value = o.scsT || ''; $('tcModal').classList.remove('hidden'); setTimeout(function () { $('tcVal').focus(); }, 50);
}
function saveTc() {
  var v = $('tcVal').value; if (!S.tc) return;
  var no = S.tc.no, pin = S.tc.pin; $('tcModal').classList.add('hidden');
  loading(true);
  gsq('setTransportCost', no, v, pin).then(function (res) {
    loading(false);
    toast('🚚 ' + no + ' ✔ ' + t('transport cost saved', 'ট্রান্সপোর্ট খরচ সেভ হয়েছে'), 'success'); S.cache = {}; loadOrders(); bgFinish(res, false);
  }).catch(function (e) { loading(false); popup(e.message); });
}
function toggleOrder(no) {
  S.open[no] = !S.open[no];
  document.querySelectorAll('.od[data-no="' + no + '"]').forEach(function (el) { el.innerHTML = S.open[no] ? detailHtml(S.ordMap[no]) : ''; });
}
function printOrder(no, lh) {
  loading(true);
  gs('generateInstantHtmlContent', no, !!lh).then(function (res) {
    loading(false);
    if (!res.ok) { popup(res.error || 'Could not generate print content.'); return; }
    var w = window.open('', '_blank');
    if (!w) { popup(t('Popup blocked. Please allow popups for this site.', 'পপআপ ব্লক হয়েছে। এই সাইটের জন্য পপআপ অনুমতি দিন।')); return; }
    w.document.open(); w.document.write(res.html); w.document.close();
    try { w.document.title = 'Bill & Challan ' + (res.orderNo || no); } catch (e) {}
    setTimeout(function () { try { w.print(); } catch (e) { popup('Could not open print dialog: ' + e.message); } }, 1000);
  }).catch(function (e) { loading(false); popup(e.message); });
}
function printSummary() {
  var w = window.open('', '_blank');
  if (!w) { popup(t('Popup blocked. Please allow popups for this site.', 'পপআপ ব্লক হয়েছে। এই সাইটের জন্য পপআপ অনুমতি দিন।')); return; }
  var styles = Array.prototype.map.call(document.querySelectorAll('style'), function (s) { return s.outerHTML; }).join('');
  var tmp = document.createElement('div'); tmp.innerHTML = $('dMonth') ? $('dMonth').innerHTML : '';
  tmp.querySelectorAll('button').forEach(function (b) { b.remove(); });
  var sb = tmp.querySelector('#sumBody'); if (sb) sb.classList.remove('hidden');
  w.document.open();
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Short Summary</title>' + styles + '</head><body style="padding:12px;background:#fff"><h2 style="text-align:center;margin:0 0 10px;font-weight:800">Order Short Summary</h2>' + tmp.innerHTML + '</body></html>');
  w.document.close();
  setTimeout(function () { try { w.print(); } catch (e) { popup(e.message); } }, 800);
}
/* swipe to change month */
(function () {
  var x0 = 0, y0 = 0;
  document.addEventListener('touchstart', function (e) { if (S.tab !== 'orders' || !e.target.closest('#ordersBody')) return; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (S.tab !== 'orders' || !x0 || !e.target.closest('#ordersBody')) { x0 = 0; return; }
    var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = 0;
    if (Math.abs(dx) > 80 && Math.abs(dy) < 50) moveMonth(dx < 0 ? 1 : -1);
  }, { passive: true });
})();

/* ------------------------------------------------------------------ HISTORY */
var ENT_LBL = { Order: 'Order', Product: 'Product', Seller: 'Seller', Settings: 'Settings' };
var KEY_LBL = { delivery: 'Delivery', client: 'Client', mobile: 'Mobile', address: 'Address', transportFee: 'Transport Fee', scsTransportCost: 'SCS Transport Cost', orderBy: 'Order By', commissionHolder: 'Commission Holder', items: 'Products', productName: 'Product', unit: 'Unit', packSize: 'Pack Size', name: 'Name' };
function diffHtml(b, a) {
  var keys = uniqArr(Object.keys(b || {}).concat(Object.keys(a || {}))), out = '';
  keys.forEach(function (k) {
    var bv = b ? b[k] : undefined, av = a ? a[k] : undefined;
    if (JSON.stringify(bv) === JSON.stringify(av)) return;
    var lbl = KEY_LBL[k] || k;
    if (Array.isArray(bv) || Array.isArray(av)) {
      var bl = bv || [], al = av || [];
      out += '<div class="mb-1.5"><div class="text-[10px] font-bold uppercase text-slate-500">' + esc(lbl) + '</div>' +
        bl.filter(function (x) { return al.indexOf(x) === -1; }).map(function (x) { return '<div class="text-[11px] px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 line-through">' + esc(x) + '</div>'; }).join('') +
        al.filter(function (x) { return bl.indexOf(x) === -1; }).map(function (x) { return '<div class="text-[11px] px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">' + esc(x) + '</div>'; }).join('') + '</div>';
    } else {
      out += '<div class="mb-1.5"><div class="text-[10px] font-bold uppercase text-slate-500">' + esc(lbl) + '</div><div class="flex flex-wrap items-center gap-1.5 text-[11px]">' +
        (bv !== undefined && bv !== null && bv !== '' ? '<span class="px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 line-through">' + esc(bv) + '</span>' : '<span class="text-slate-400">∅</span>') + '<span>→</span>' +
        (av !== undefined && av !== null && av !== '' ? '<span class="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">' + esc(av) + '</span>' : '<span class="text-slate-400">∅</span>') + '</div></div>';
    }
  });
  return out || '<div class="text-[11px] text-slate-500">—</div>';
}
function loadHistory() {
  if (S.hist) renderHistory();
  else $('viewHistory').innerHTML = '<div class="text-center py-14 text-sm text-slate-500">…</div>';
  loading(true);
  gs('getHistory', 300).then(function (r) { loading(false); S.hist = r.items; if (S.tab === 'history') renderHistory(); }).catch(function (e) { loading(false); toast(e.message, 'error'); });
}
function renderHistory() {
  var q = S.hq.toLowerCase().trim(), list = (S.hist || []).filter(function (h) { return !q || (h.entity + ' ' + h.ref + ' ' + h.action + ' ' + h.by + ' ' + JSON.stringify(h.before) + JSON.stringify(h.after)).toLowerCase().indexOf(q) > -1; });
  var el = $('viewHistory'), keep = document.activeElement && document.activeElement.id === 'hSearch';
  el.innerHTML = '<div class="flex items-center justify-between gap-2 mb-3"><div><h2 class="text-base sm:text-lg font-extrabold">' + t('Edit History', 'এডিট হিস্ট্রি') + '</h2><p class="text-[11px] text-slate-500">' + t('Every change: what it was before, what it is now, and when. Only Admin can delete.', 'প্রতিটি পরিবর্তন: আগে কী ছিল, এখন কী, কখন। শুধু অ্যাডমিন ডিলিট করতে পারবে।') + '</p></div><button type="button" data-act="histClear" class="btn-p ' + K.red + '">' + ic('trash', 'w-3.5 h-3.5') + t('Clear all', 'সব মুছুন') + '</button></div>' +
    '<div class="relative mb-3"><span class="absolute left-3 top-2.5 text-slate-400" >' + ic('search', 'w-4 h-4') + '</span><input id="hSearch" class="inp pl-9" value="' + esc(S.hq) + '" placeholder="' + t('Search history...', 'হিস্ট্রি খুঁজুন...') + '" /></div>' +
    (list.length ? '<div class="space-y-2.5">' + list.map(function (h) {
      var colr = { Add: 'bg-emerald-100 text-emerald-700', Delete: 'bg-rose-100 text-rose-700', Edit: 'bg-amber-100 text-amber-700' }[h.action] || 'bg-blue-100 text-blue-700';
      return '<div class="' + K.card + '"><div class="flex items-start justify-between gap-2 mb-2"><div class="min-w-0"><div class="flex flex-wrap items-center gap-1.5"><span class="px-2 py-0.5 rounded-lg text-[10px] font-bold ' + colr + '">' + esc(h.action) + '</span><span class="text-xs font-extrabold">' + esc(h.entity) + '</span><span class="text-xs font-bold text-pink-600 dark:text-pink-400 truncate">' + esc(h.ref) + '</span></div><div class="text-[10px] text-slate-500 mt-0.5">🕘 ' + esc(h.time) + ' · ' + esc(h.by) + '</div></div>' +
        '</div>' + diffHtml(h.before, h.after) + '</div>';
    }).join('') + '</div>' : '<div class="text-center py-14 text-sm text-slate-500">' + t('No history yet.', 'এখনো কোনো হিস্ট্রি নেই।') + '</div>');
  if (keep) { var i = $('hSearch'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}
function histDelete(ids) {
  askAdmin().then(function (pin) {
    if (!pin) return;
    loading(true);
    gs('deleteHistory', ids, pin).then(function () { loading(false); toast(t('Deleted', 'মুছে ফেলা হয়েছে'), 'success'); S.hist = null; loadHistory(); }).catch(function (e) { loading(false); toast(e.message, 'error'); });
  });
}

/* ------------------------------------------------------------------ ADMIN */
function openAdmin() {
  if (S.adminPin) { showTab('admin'); loadAdmin(); return; }
  askPin('admin', 'Admin Security PIN', 'অ্যাডমিন নিরাপত্তা পিন', 'Enter PIN to access Admin', 'অ্যাডমিন প্যানেলে প্রবেশের জন্য পিন দিন').then(function (pin) {
    if (!pin) return;
    S.adminPin = pin; showTab('admin'); loadAdmin();
  });
}
function loadAdmin() {
  if (S.cfg) renderAdmin();
  loading(true);
  gs('getAdminConfig', S.adminPin).then(function (c) { loading(false); S.cfg = c; renderAdmin(); })
    .catch(function (e) { loading(false); S.adminPin = ''; toast(e.message, 'error'); showTab('dash'); });
}
function sw(id, on) { return '<button type="button" id="' + id + '" data-act="switch" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" class="scs-switch' + (on ? ' on' : '') + '"><span></span></button>'; }
function isOn(id) { return $(id).classList.contains('on'); }
function admCard(title, sub, body, right) {
  return '<div class="bg-white dark:bg-slate-900 rounded-2xl p-3 sm:p-4 border border-slate-200 dark:border-slate-800 mb-3"><div class="flex items-start justify-between gap-3"><div><div class="text-sm font-extrabold">' + title + '</div><p class="text-[11px] text-slate-500 mt-0.5 mb-3">' + sub + '</p></div>' + (right || '') + '</div>' + body + '</div>';
}
var PH = ['{client}', '{orderNo}', '{products}', '{price}', '{total}', '{transport}', '{address}', '{delivery}', '{mobile}', '{orderBy}'];
function lineHtml(l, i, n) {
  return '<div class="sms-line flex items-start gap-2 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60" data-id="' + esc(l.id) + '" data-label="' + esc(l.label) + '">' +
    '<div class="pt-1">' + sw('sl' + i, l.enabled) + '</div>' +
    '<div class="flex-1 min-w-0"><div class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">' + esc(l.label) + '</div><textarea rows="' + (String(l.text).indexOf('\n') > -1 ? 2 : 1) + '" class="inp sl-text">' + esc(l.text) + '</textarea></div>' +
    '<div class="flex flex-col gap-1"><button type="button" data-act="lineUp" data-i="' + i + '" ' + (i === 0 ? 'disabled' : '') + ' class="p-1 rounded-lg ' + K.ghost + ' disabled:opacity-30 cursor-pointer">' + ic('left', 'w-3 h-3 rotate-90') + '</button><button type="button" data-act="lineDown" data-i="' + i + '" ' + (i === n - 1 ? 'disabled' : '') + ' class="p-1 rounded-lg ' + K.ghost + ' disabled:opacity-30 cursor-pointer">' + ic('right', 'w-3 h-3 rotate-90') + '</button></div></div>';
}
var ADM_TABS = [['sms', '💬', 'SMS Setup', 'এসএমএস সেটআপ'], ['orders', '🗑', 'Delete Order', 'অর্ডার ডিলিট'], ['products', '🧪', 'Product List', 'প্রোডাক্ট লিস্ট'], ['sellers', '👤', 'Order By', 'অর্ডার বাই'], ['pdf', '📄', 'PDF & Letterhead', 'পিডিএফ ও লেটারহেড'], ['backup', '💾', 'Backup & Restore', 'ব্যাকআপ ও রিস্টোর']];
/* SCS Management: Destination Sync (Monthly Report এখন সরাসরি একই ডাটাবেস পড়ে) ও Security PIN (এখন অ্যাকাউন্ট) ট্যাব বাদ */
function renderAdmin() {
  var tabs = '<div class="flex items-center gap-1 mb-3"><button type="button" data-act="admLeft" class="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 shrink-0 cursor-pointer">' + ic('left', 'w-4 h-4') + '</button>' +
    '<div id="admTabs" class="drag-scroll scs-nav-scroll flex gap-1.5 overflow-x-auto scrollbar-none scroll-smooth w-full py-0.5">' + ADM_TABS.map(function (x) {
      return '<button type="button" data-act="admTab" data-id="' + x[0] + '"' + (S.admTab === x[0] ? ' data-on="1"' : '') + ' class="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer whitespace-nowrap ' + (S.admTab === x[0] ? 'bg-pink-600 text-white shadow-md shadow-pink-600/25' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700') + '"><span>' + x[1] + '</span>' + t(x[2], x[3]) + '</button>';
    }).join('') + '</div><button type="button" data-act="admRight" class="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 shrink-0 cursor-pointer">' + ic('right', 'w-4 h-4') + '</button></div>';
  var body = { sms: admSms, products: function () { return admList('product'); }, sellers: function () { return admList('seller'); }, sync: admSync, pdf: admPdf, backup: admBackup, orders: admOrders, pin: admPin }[S.admTab]();
  $('viewAdmin').innerHTML = tabs + '<div id="admBody">' + body + '</div>';
  if (S.admTab === 'sms') smsPreview(true);
  var on = $('admTabs') && $('admTabs').querySelector('[data-on]');
  if (on) { var bx = $('admTabs'); bx.style.scrollBehavior = 'auto'; bx.scrollLeft = Math.max(0, on.offsetLeft - bx.clientWidth / 2 + on.offsetWidth / 2); bx.style.scrollBehavior = ''; }
}
function admSms() {
  var sm = S.cfg.sms;
  return admCard(t('SMS Service', 'এসএমএস সার্ভিস'), t('After an order is placed, an SMS is sent to the customer. Turn it off any time.', 'অর্ডার হওয়ার পর কাস্টমারকে এসএমএস যাবে। যেকোনো সময় বন্ধ করা যাবে।'),
    '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">' +
      '<div class="sm:col-span-2"><label class="' + K.lbl + '">API URL</label><input id="smsUrl" class="inp font-mono" placeholder="https://..." value="' + esc(sm.apiUrl) + '" /></div>' +
      '<div><label class="' + K.lbl + '">API Key</label><input id="smsKey" type="password" autocomplete="new-password" class="inp font-mono" placeholder="' + esc(sm.apiKeySet ? sm.apiKeyMasked + ' (' + t('saved - leave blank to keep', 'সেভ আছে - ফাঁকা রাখলে একই থাকবে') + ')' : 'API Key') + '" /></div>' +
      '<div><label class="' + K.lbl + '">Sender ID</label><input id="smsSender" class="inp" value="' + esc(sm.senderId) + '" /></div></div>' +
    '<div class="text-xs font-bold mb-1">' + t('SMS Message Setup', 'এসএমএসে কী কী লেখা যাবে') + '</div>' +
    '<p class="text-[11px] text-slate-500 mb-2">' + t('Switch each line on/off, edit the text and reorder. Click a placeholder to insert it.', 'প্রতিটি লাইন অন/অফ করুন, লেখা বদলান ও ক্রম ঠিক করুন। প্লেসহোল্ডারে ক্লিক করলে বসে যাবে।') + '</p>' +
    '<div class="flex flex-wrap gap-1.5 mb-2">' + PH.map(function (p) { return '<button type="button" data-act="ph" data-p="' + p + '" class="px-2 py-1 rounded-lg text-[10px] font-mono font-bold bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-900/50 cursor-pointer">' + p + '</button>'; }).join('') + '</div>' +
    '<div id="smsLines" class="space-y-2">' + sm.lines.map(function (l, i) { return lineHtml(l, i, sm.lines.length); }).join('') + '</div>' +
    '<div class="flex flex-wrap gap-2 mt-3"><button type="button" data-act="smsPreview" class="btn-p ' + K.ghost + '">' + t('Preview', 'প্রিভিউ') + '</button><button type="button" data-act="smsReset" class="btn-p ' + K.ghost + '">' + t('Reset message', 'মেসেজ ডিফল্ট করুন') + '</button></div>' +
    '<pre id="smsPrev" class="hidden mt-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] leading-relaxed" style="white-space:pre-wrap;font-family:inherit"></pre>' +
    '<div class="flex flex-col sm:flex-row gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800"><input id="smsTest" class="inp flex-1" placeholder="01XXXXXXXXX" inputmode="tel" /><button type="button" data-act="smsTestSend" class="btn-p ' + K.blue + '">' + t('Send Test SMS', 'টেস্ট এসএমএস') + '</button><button type="button" data-act="smsRetry" class="btn-p ' + K.amber + '">' + t('Retry Pending SMS', 'পেন্ডিং এসএমএস আবার পাঠান') + '</button></div>' +
    '<div class="flex justify-end mt-3"><button type="button" data-act="smsSave" class="btn-p ' + K.pink + '">' + t('Save SMS Settings', 'এসএমএস সেটিংস সেভ') + '</button></div>', sw('smsOn', sm.enabled));
}
function admSync() {
  var sy = S.cfg.sync;
  return admCard(t('Destination Sheet Sync', 'ডেস্টিনেশন শিট সিঙ্ক'), t('Orders are sent to another Google Sheet in the same format. Any edit is updated there instantly.', 'অর্ডার অন্য গুগল শিটে একই ফরম্যাটে যাবে। কোনো এডিট হলে সাথে সাথে সেখানেও আপডেট হবে।'),
    '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3"><div class="sm:col-span-2"><label class="' + K.lbl + '">' + t('Destination Google Sheet link', 'ডেস্টিনেশন গুগল শিটের লিংক') + '</label><input id="syUrl" class="inp font-mono" placeholder="https://docs.google.com/spreadsheets/d/..." value="' + esc(sy.sheetUrl) + '" /></div>' +
    '<div><label class="' + K.lbl + '">' + t('Tab name', 'ট্যাবের নাম') + '</label><input id="syTab" class="inp" value="' + esc(sy.tabName) + '" /></div></div>' +
    '<div class="flex items-center gap-2 mt-3">' + sw('syAuto', sy.auto) + '<span class="text-xs font-semibold">' + t('Also auto-sync direct edits made inside the sheet', 'শিটে সরাসরি করা এডিটও অটো সিঙ্ক হবে') + '</span></div>' +
    '<p class="text-[11px] mt-2 ' + (sy.lastError ? 'text-rose-600' : 'text-slate-500') + '">' + (sy.lastError ? esc(sy.lastError) : (sy.lastSync ? t('Last sync: ', 'সর্বশেষ সিঙ্ক: ') + esc(sy.lastSync) : t('Not synced yet.', 'এখনো সিঙ্ক হয়নি।'))) + '</p>' +
    '<p class="text-[11px] text-slate-500 mt-1">' + t('Share the destination sheet with this script’s Google account as Editor.', 'ডেস্টিনেশন শিটটি এই স্ক্রিপ্টের গুগল অ্যাকাউন্টের সাথে Editor হিসেবে শেয়ার করুন।') + '</p>' +
    '<div class="flex flex-wrap justify-end gap-2 mt-3"><button type="button" data-act="syncNow" class="btn-p ' + K.ghost + '">' + t('Sync all now', 'এখনই সব সিঙ্ক করুন') + '</button><button type="button" data-act="syncSave" class="btn-p ' + K.pink + '">' + t('Save Sync Settings', 'সিঙ্ক সেটিংস সেভ') + '</button></div>', sw('syOn', sy.enabled));
}
function admPdf() {
  var c = S.cfg;
  return admCard(t('PDF Setup', 'পিডিএফ সেটআপ'), t('Bill & Challan PDFs are saved in Supabase Storage (bucket scs-files) after every order.', 'প্রতিটি অর্ডারের পর বিল ও চালান PDF Supabase Storage-এ (scs-files) সেভ হয়।'),
    '<input id="pdfFolder" type="hidden" value="" /><div class="grid grid-cols-1 gap-3"><div><label class="' + K.lbl + '">' + t('Seal image link (https://… image URL, or Google Drive file ID)', 'সিল ইমেজের লিংক (https://… ইমেজ URL, অথবা গুগল ড্রাইভ ফাইল আইডি)') + '</label><input id="pdfSeal" class="inp font-mono" value="' + esc(c.pdf.sealId) + '" /></div><div><label class="' + K.lbl + '">' + t('…or upload seal image (PNG with transparent background is best)', '…অথবা সিলের ইমেজ আপলোড করুন (স্বচ্ছ ব্যাকগ্রাউন্ডের PNG সবচেয়ে ভালো)') + '</label><input id="sealFile" type="file" accept="image/png,image/jpeg,image/webp" class="inp" /></div></div>' +
    '<div class="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800"><div class="text-xs font-extrabold mb-1">🖼 ' + t('Company Letterhead Pad', 'কোম্পানির লেটারহেড প্যাড') + '</div><p class="text-[11px] text-slate-500 mb-2">' + t('Letter size (8.5×11 in) image. Content stays inside the pad margins: top 1.2 in, bottom 0.75 in. It is used only when you tick “with letterhead” while printing or downloading a PDF.', 'লেটার সাইজ (৮.৫×১১ ইঞ্চি) ইমেজ। প্যাডের মার্জিনের ভেতরে লেখা থাকবে: উপরে ১.২ ইঞ্চি, নিচে ০.৭৫ ইঞ্চি। প্রিন্ট বা PDF ডাউনলোডের সময় “লেটারহেড সহ” টিক দিলেই শুধু ব্যবহার হবে।') + '</p>' +
    '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label class="' + K.lbl + '">' + t('Saved letterhead (storage path)', 'সেভ করা লেটারহেড (স্টোরেজ পাথ)') + '</label><input id="lhId" class="inp font-mono" readonly value="' + esc(c.pdf.letterheadId || '') + '" /></div>' +
    '<div><label class="' + K.lbl + '">' + t('…or upload image (PNG/JPG)', '…অথবা ইমেজ আপলোড (PNG/JPG)') + '</label><input id="lhFile" type="file" accept="image/png,image/jpeg" class="inp" /></div></div>' +
    '<p class="text-[11px] mt-1.5 ' + (c.pdf.letterheadId ? 'text-emerald-600' : 'text-slate-500') + '">' + (c.pdf.letterheadId ? '✅ ' + t('Letterhead is set.', 'লেটারহেড সেট করা আছে।') : t('No letterhead set.', 'লেটারহেড সেট করা নেই।')) + '</p></div>' +
    '<div class="flex flex-wrap justify-end gap-2 mt-3"><button type="button" data-act="pdfAll" class="btn-p ' + K.green + '">📄 ' + t('All PDF Upload', 'সব PDF আপলোড') + '</button><button type="button" data-act="pdfSave" class="btn-p ' + K.pink + '">' + t('Save', 'সেভ করুন') + '</button></div>');
}
function admOrders() {
  return admCard(t('Delete Order', 'অর্ডার ডিলিট'), t('Admin only. Removes the whole order (all its products) from the sheet and the destination sheet. A copy is kept in History.', 'শুধু অ্যাডমিন। পুরো অর্ডার (সব প্রোডাক্টসহ) শিট ও ডেস্টিনেশন শিট থেকে মুছে যাবে। হিস্ট্রিতে একটা কপি থাকবে।'),
    '<div class="flex gap-2"><input id="delNo" class="inp-sm flex-1 sm:flex-none" placeholder="202611-01" /><button type="button" data-act="delFind" class="btn-p ' + K.ghost + ' !py-1.5">' + t('Find', 'খুঁজুন') + '</button></div><div id="delPrev" class="mt-3"></div>');
}
function admAuto() {
  var b = S.cfg.backup, opt = [['1', 'Every 1 minute', 'প্রতি ১ মিনিটে'], ['5', 'Every 5 minutes', 'প্রতি ৫ মিনিটে'], ['10', 'Every 10 minutes', 'প্রতি ১০ মিনিটে'], ['15', 'Every 15 minutes', 'প্রতি ১৫ মিনিটে'], ['30', 'Every 30 minutes', 'প্রতি ৩০ মিনিটে'], ['60', 'Every hour', 'প্রতি ঘন্টায়'], ['360', 'Every 6 hours', 'প্রতি ৬ ঘন্টায়'], ['1440', 'Every day', 'প্রতিদিন']];
  return admCard('☁️ ' + t('Auto Backup to Google Drive', 'গুগল ড্রাইভে অটো ব্যাকআপ'), t('Saves a lifetime JSON backup into your Drive folder on a schedule. Skips when nothing changed. Only the last N files are kept.', 'নির্দিষ্ট সময় পরপর লাইফটাইম JSON ব্যাকআপ আপনার ড্রাইভ ফোল্ডারে সেভ হবে। কিছু না বদলালে স্কিপ করবে। শুধু শেষ N টি ফাইল থাকবে।'),
    '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3"><div class="sm:col-span-3"><label class="' + K.lbl + '">' + t('Drive folder link', 'ড্রাইভ ফোল্ডারের লিংক') + '</label><input id="abFolder" class="inp font-mono" placeholder="https://drive.google.com/drive/folders/..." value="' + esc(b.folderId) + '" /></div>' +
    '<div class="sm:col-span-2"><label class="' + K.lbl + '">' + t('Backup every', 'কতক্ষণ পরপর') + '</label><select id="abEvery" class="inp">' + opt.map(function (o) { return '<option value="' + o[0] + '"' + (b.every === o[0] ? ' selected' : '') + '>' + t(o[1], o[2]) + '</option>'; }).join('') + '</select></div>' +
    '<div><label class="' + K.lbl + '">' + t('Keep last files', 'শেষ কতটি ফাইল রাখবে') + '</label><input id="abKeep" type="number" min="1" max="500" class="inp" value="' + esc(b.keep) + '" /></div></div>' +
    '<p class="text-[11px] mt-2 ' + (String(b.lastStatus).indexOf('ERROR') === 0 ? 'text-rose-600' : 'text-slate-500') + '">' + (b.lastTime ? t('Last: ', 'সর্বশেষ: ') + esc(b.lastTime) + ' · ' + esc(b.lastStatus) : t('No backup yet.', 'এখনো ব্যাকআপ হয়নি।')) + '</p>' +
    '<p class="text-[11px] text-amber-600 mt-1">' + t('Tip: very short intervals use more of your Google Apps Script daily trigger time.', 'টিপ: খুব কম সময়ের ব্যবধান রাখলে গুগল Apps Script-এর দৈনিক ট্রাইগার সময় বেশি খরচ হয়।') + '</p>' +
    '<div class="flex flex-wrap justify-end gap-2 mt-3"><button type="button" data-act="bkNow" class="btn-p ' + K.ghost + '">' + t('Backup now', 'এখনই ব্যাকআপ') + '</button><button type="button" data-act="bkSave" class="btn-p ' + K.pink + '">' + t('Save', 'সেভ') + '</button></div>', sw('abOn', b.enabled));
}
function admBackup() {
  var cy = new Date().getFullYear(), yrs = '';
  for (var y = cy; y >= cy - 6; y--) yrs += '<option value="' + y + '">' + y + '</option>';
  var now = new Date(), ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  var bk = admCard(t('Backup (JSON)', 'ব্যাকআপ (JSON)'), t('Download your data as a JSON file. Lifetime backup also includes products, sellers, history and settings (API key is never exported).', 'আপনার ডাটা JSON ফাইলে ডাউনলোড করুন। লাইফটাইম ব্যাকআপে প্রোডাক্ট, সেলার, হিস্ট্রি ও সেটিংসও থাকে (API Key কখনো এক্সপোর্ট হয় না)।'),
    '<div class="space-y-2"><label class="flex items-center gap-2 text-xs font-semibold cursor-pointer"><input type="radio" name="bkScope" value="all" checked class="accent-pink-600" /> ' + t('Lifetime – all data', 'লাইফটাইম – সকল ডাটা') + '</label>' +
    '<label class="flex items-center gap-2 text-xs font-semibold cursor-pointer"><input type="radio" name="bkScope" value="year" class="accent-pink-600" /> ' + t('Year-wise', 'ইয়ার ভিত্তিক') + ' <select id="bkYear" class="inp" style="width:auto">' + yrs + '</select></label>' +
    '<label class="flex items-center gap-2 text-xs font-semibold cursor-pointer"><input type="radio" name="bkScope" value="month" class="accent-pink-600" /> ' + t('Month-wise', 'মাস ভিত্তিক') + ' <input id="bkMonth" type="month" value="' + ym + '" class="inp" style="width:auto" /></label></div>' +
    '<div class="flex justify-end mt-3"><button type="button" data-act="bkDownload" class="btn-p ' + K.blue + '">' + ic('download', 'w-3.5 h-3.5') + t('Download Backup', 'ব্যাকআপ ডাউনলোড') + '</button></div>');
  var rs = admCard(t('Restore from JSON', 'JSON থেকে রিস্টোর'), t('Missing orders, products and sellers are added. Existing order numbers are skipped.', 'যেসব অর্ডার, প্রোডাক্ট ও সেলার নেই সেগুলো যোগ হবে। আগে থেকে থাকা অর্ডার নম্বর বাদ যাবে।'),
    '<input id="rsFile" type="file" accept="application/json,.json" class="inp mb-2" /><label class="flex items-center gap-2 text-xs font-semibold cursor-pointer"><input id="rsReplace" type="checkbox" class="accent-pink-600" /> ' + t('Replace all current data first (use only for a lifetime backup)', 'আগে বর্তমান সব ডাটা মুছে তারপর রিস্টোর (শুধু লাইফটাইম ব্যাকআপে ব্যবহার করুন)') + '</label>' +
    '<div class="flex justify-end mt-3"><button type="button" data-act="rsGo" class="btn-p ' + K.amber + '">' + t('Restore', 'রিস্টোর') + '</button></div>');
  var rst = admCard('⚠️ ' + t('Reset App', 'অ্যাপ রিসেট'), t('Erases ALL orders, products, sellers and history. Settings and PINs stay. Enabled only after you download a lifetime backup in this session.', 'সকল অর্ডার, প্রোডাক্ট, সেলার ও হিস্ট্রি মুছে যাবে। সেটিংস ও পিন থাকবে। এই সেশনে লাইফটাইম ব্যাকআপ ডাউনলোড করলেই শুধু চালু হবে।'),
    '<div class="flex items-center justify-between gap-2"><span class="text-[11px] font-semibold ' + (S.backupDone ? 'text-emerald-600' : 'text-rose-600') + '">' + (S.backupDone ? '✅ ' + t('Lifetime backup downloaded', 'লাইফটাইম ব্যাকআপ ডাউনলোড হয়েছে') : '⛔ ' + t('Download a lifetime backup first', 'আগে লাইফটাইম ব্যাকআপ ডাউনলোড করুন')) + '</span><button type="button" data-act="rstGo" ' + (S.backupDone ? '' : 'disabled') + ' class="btn-p ' + K.red + '">' + t('Reset', 'রিসেট') + '</button></div>');
  return bk + rs + rst;   /* Drive অটো ব্যাকআপ বাদ — Supabase নিজেই দৈনিক ব্যাকআপ রাখে */
}
function admPin() {
  return admCard(t('Security PINs', 'নিরাপত্তা পিন'), t('User PIN (2019) is used for editing orders. Change the Admin PIN here (4–8 digits).', 'ইউজার পিন (2019) অর্ডার এডিটে লাগে। এখান থেকে অ্যাডমিন পিন বদলান (৪–৮ ডিজিট)।'),
    '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3"><div><label class="' + K.lbl + '">' + t('Current Admin PIN', 'বর্তমান অ্যাডমিন পিন') + '</label><input id="pinOld" type="password" inputmode="numeric" maxlength="8" class="inp" /></div><div><label class="' + K.lbl + '">' + t('New Admin PIN', 'নতুন অ্যাডমিন পিন') + '</label><input id="pinNew" type="password" inputmode="numeric" maxlength="8" class="inp" /></div><div><label class="' + K.lbl + '">' + t('Confirm New PIN', 'নতুন পিন নিশ্চিত করুন') + '</label><input id="pinNew2" type="password" inputmode="numeric" maxlength="8" class="inp" /></div></div>' +
    '<div class="flex justify-end mt-3"><button type="button" data-act="pinChange" class="btn-p ' + K.pink + '">' + t('Change Admin PIN', 'অ্যাডমিন পিন বদলান') + '</button></div>');
}
/* products & sellers (generic list manager) */
var ENT = { product: { fields: ['productName', 'unit'], title: ['Product List', 'প্রোডাক্ট লিস্ট'], sub: ['Add, edit, delete and arrange products. Admin PIN is required for every change.', 'প্রোডাক্ট যোগ, এডিট, ডিলিট ও সাজান। প্রতিটি পরিবর্তনে অ্যাডমিন পিন লাগবে।'] }, seller: { fields: ['name'], title: ['Order By (Sellers)', 'অর্ডার বাই (সেলার)'], sub: ['Sellers shown in the Order By dropdown. Arrange their order with the arrows.', 'অর্ডার ফর্মের Order By ড্রপডাউনে দেখানো সেলার। তীর দিয়ে ক্রম ঠিক করুন।'] } };
function packRow(v) { return '<div class="flex gap-1.5 pk-row"><input class="inp pk" value="' + esc(v || '') + '" placeholder="' + t('e.g. 20 Litre', 'যেমন: ২০ লিটার') + '" /><button type="button" data-act="packDel" class="p-2 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-600 cursor-pointer shrink-0">' + ic('x', 'w-3.5 h-3.5') + '</button></div>'; }
function admList(kind) {
  var E = ENT[kind], full = kind === 'product' ? S.app.products : S.app.sellers, q = (S.aq || '').toLowerCase();
  var list = full.filter(function (x) { return !q || JSON.stringify(x).toLowerCase().indexOf(q) > -1; });
  var rows = list.map(function (x) {
    var idx = full.indexOf(x), cols = kind === 'product' ? '<div class="flex-1 min-w-0"><div class="text-xs font-bold truncate">' + esc(x.productName) + '</div><div class="flex flex-wrap gap-1 mt-0.5"><span class="text-[10px] text-slate-500">' + esc(x.unit) + '</span>' + (x.packSizes.length ? x.packSizes.map(function (p) { return '<span class="px-1.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold">' + esc(p) + '</span>'; }).join('') : '<span class="px-1.5 rounded bg-amber-100 text-amber-700 text-[10px] font-semibold">' + NO_PACK + '</span>') + '</div></div>' : '<div class="flex-1 text-xs font-bold">' + esc(x.name) + '</div>';
    var arr = q ? '' : '<button type="button" data-act="entUp" data-k="' + kind + '" data-i="' + idx + '" ' + (idx === 0 ? 'disabled' : '') + ' class="p-1 rounded-lg ' + K.ghost + ' disabled:opacity-30 cursor-pointer">' + ic('up', 'w-3 h-3') + '</button><button type="button" data-act="entDown" data-k="' + kind + '" data-i="' + idx + '" ' + (idx === full.length - 1 ? 'disabled' : '') + ' class="p-1 rounded-lg ' + K.ghost + ' disabled:opacity-30 cursor-pointer">' + ic('down', 'w-3 h-3') + '</button>';
    return '<div class="flex items-center gap-2 py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0"><span class="w-6 h-6 shrink-0 rounded-full bg-pink-100 dark:bg-pink-950/50 text-pink-700 dark:text-pink-300 text-[10px] font-black flex items-center justify-center">' + (idx + 1) + '</span>' + cols + '<div class="flex gap-1 items-center">' + arr +
      '<button type="button" data-act="entEdit" data-k="' + kind + '" data-id="' + esc(x.id) + '" class="p-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-700 cursor-pointer">' + ic('edit', 'w-3.5 h-3.5') + '</button>' +
      '<button type="button" data-act="entDel" data-k="' + kind + '" data-id="' + esc(x.id) + '" class="p-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-600 cursor-pointer">' + ic('trash', 'w-3.5 h-3.5') + '</button></div></div>';
  }).join('') || '<div class="text-xs text-slate-500 py-4 text-center">—</div>';
  var form = '<div id="entForm" class="hidden mb-3 p-3 rounded-xl border border-dashed border-pink-300 dark:border-pink-900 bg-pink-50/50 dark:bg-pink-950/20"><input type="hidden" id="entId" />' +
    (kind === 'product' ? '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2"><div><label class="' + K.lbl + '">' + t('Product Name', 'প্রোডাক্টের নাম') + '</label><input id="entF0" class="inp" /></div><div><label class="' + K.lbl + '">' + t('Unit', 'ইউনিট') + '</label><input id="entF1" class="inp" list="dlUnit" /></div></div>' +
      '<datalist id="dlUnit">' + S.app.unitList.map(function (u) { return '<option value="' + esc(u) + '">'; }).join('') + '</datalist>' +
      '<div class="mt-2"><div class="flex items-center justify-between mb-1"><label class="' + K.lbl + ' !mb-0">' + t('Pack Sizes', 'প্যাক সাইজ') + '</label><label class="flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer"><input id="noPack" type="checkbox" class="accent-pink-600" /> ' + t('No pack size', 'প্যাক সাইজ নেই') + '</label></div>' +
      '<div id="packBox"><div id="packList" class="space-y-1.5">' + packRow('') + '</div><button type="button" data-act="packAdd" class="mt-1.5 btn-p ' + K.green + ' !py-1.5">' + ic('plus', 'w-3.5 h-3.5') + t('Add another pack size', 'আরেকটি প্যাক সাইজ') + '</button></div></div>' : '<div><label class="' + K.lbl + '">' + t('Seller Name', 'সেলারের নাম') + '</label><input id="entF0" class="inp" /></div>') +
    '<div class="flex justify-end gap-2 mt-2"><button type="button" data-act="entCancel" class="btn-p ' + K.ghost + '">' + t('Cancel', 'বাতিল') + '</button><button type="button" data-act="entSave" data-k="' + kind + '" class="btn-p ' + K.pink + '">' + t('Save', 'সেভ') + '</button></div></div>';
  return admCard(t(E.title[0], E.title[1]) + ' <span class="text-slate-500 font-medium">(' + full.length + ')</span>', t(E.sub[0], E.sub[1]),
    '<div class="flex gap-2 mb-3 items-center"><input id="admQ" class="inp-sm flex-1 sm:flex-none" placeholder="' + t('Search...', 'খুঁজুন...') + '" value="' + esc(S.aq || '') + '" /><button type="button" data-act="entAdd" class="btn-p ' + K.green + ' !py-1.5">' + ic('plus', 'w-3.5 h-3.5') + t('Add', 'যোগ করুন') + '</button>' +
    (S.dirty[kind] ? '<button type="button" data-act="entOrderSave" data-k="' + kind + '" class="btn-p ' + K.pink + ' !py-1.5 ml-auto">' + t('Save order', 'ক্রম সেভ') + '</button>' : '') + '</div>' + form + '<div>' + rows + '</div>');
}
function moveEnt(kind, i, d) {
  var arr = kind === 'product' ? S.app.products : S.app.sellers, j = i + d; if (j < 0 || j >= arr.length) return;
  var x = arr[i]; arr[i] = arr[j]; arr[j] = x; S.dirty[kind] = true;
  if (kind === 'seller') S.app.orderByList = arr.map(function (z) { return z.name; });
  $('admBody').innerHTML = admList(kind);
}
/* SCS Management: সিল ইমেজ Supabase Storage-এ আপলোড (PDF-এ নিশ্চিতভাবে দেখা যাবে) */
function readSeal(el) {
  var f = el.files[0]; if (!f) return;
  if (f.size > 3 * 1024 * 1024) { toast(t('Image too large (max 3 MB)', 'ইমেজ অনেক বড় (সর্বোচ্চ ৩ MB)'), 'error'); return; }
  var rd = new FileReader();
  rd.onload = function () { var b64 = String(rd.result).split(',')[1]; adm(function () { return gs('uploadSeal', b64, f.type, f.name); }, t('Seal uploaded', 'সিল আপলোড হয়েছে'), function (r) { S.cfg.pdf.sealId = r.id; renderAdmin(); }); };
  rd.readAsDataURL(f);
}
function readLetterhead(el) {
  var f = el.files[0]; if (!f) return;
  if (f.size > 8 * 1024 * 1024) { toast(t('Image too large (max 8 MB)', 'ইমেজ অনেক বড় (সর্বোচ্চ ৮ MB)'), 'error'); return; }
  var rd = new FileReader();
  rd.onload = function () { var b64 = String(rd.result).split(',')[1]; adm(function () { return gs('uploadLetterhead', b64, f.type, f.name, S.adminPin); }, t('Letterhead uploaded', 'লেটারহেড আপলোড হয়েছে'), function (r) { S.cfg.pdf.letterheadId = r.id; renderAdmin(); }); };
  rd.readAsDataURL(f);
}
function entSaveBoot(r) {
  S.app.products = r.products; S.app.sellers = r.sellers; S.app.orderByList = r.orderByList;
  applyBoot(Object.assign({}, S.app)); LS.set('scs_boot', JSON.stringify(S.app));
  renderAdmin();
}
function readLines() {
  return Array.prototype.map.call(document.querySelectorAll('#smsLines .sms-line'), function (el) {
    return { id: el.dataset.id, label: el.dataset.label, enabled: el.querySelector('.scs-switch').classList.contains('on'), text: el.querySelector('.sl-text').value };
  });
}
function smsPreview(silent) {
  var box = $('smsPrev'); if (!box) return;
  gs('previewSms', { lines: readLines() }, S.adminPin).then(function (txt) { if ($('smsPrev')) { $('smsPrev').textContent = txt; $('smsPrev').classList.remove('hidden'); } })
    .catch(function (e) { if (!silent) toast(e.message, 'error'); });
}
function adm(fn, okMsg, after) {
  loading(true);
  return fn().then(function (r) { loading(false); if (okMsg) toast(okMsg, 'success'); if (after) after(r); return r; })
    .catch(function (e) { loading(false); toast(e.message, 'error'); });
}
function moveLine(i, d) {
  var lines = readLines(), j = i + d; if (j < 0 || j >= lines.length) return;
  var x = lines[i]; lines[i] = lines[j]; lines[j] = x; S.cfg.sms.lines = lines;
  $('smsLines').innerHTML = lines.map(function (l, k) { return lineHtml(l, k, lines.length); }).join(''); smsPreview(true);
}
var lastTa = null;

/* ------------------------------------------------------------------ actions */
function rerenderAll() {
  applyLang(); setFormTexts();
  if (S.tab === 'dash') renderDash();
  if (S.tab === 'orders') { buildFilters(); renderOrders(); }
  if (S.tab === 'admin' && S.cfg) renderAdmin();
  if (S.tab === 'history') renderHistory();
  rebuildRows();
}
function rebuildRows() {
  if (!$('productRows') || S.tab !== 'order') return;
  var data = rowsData(); $('productRows').innerHTML = ''; S.rowN = 0;
  data.forEach(function (d) { addRow(Object.assign({}, d, { productName: d.productName })); });
  if (!data.length) addRow();
  recalc(); fillOrderBy(S.app.orderByList); setFormTexts();
}
var ACT = {
  lang: function () { S.lang = S.lang === 'bn' ? 'en' : 'bn'; LS.set('scs_lang', S.lang); rerenderAll(); },
  theme: function () { S.theme = S.theme === 'dark' ? 'light' : 'dark'; LS.set('scs_theme', S.theme); applyTheme(); },
  logout: logout,
  loginGo: function () { loginPad.submit(); },
  sync: function () {
    $('syncIc').firstChild.classList.add('animate-spin');
    gs('getBootstrapData').then(function (d) { LS.set('scs_boot', JSON.stringify(d)); applyBoot(d); setOrderNo(d.nextOrderNo); S.hist = null; refreshVisible(); toast(t('Data synced', 'ডাটা সিঙ্ক হয়েছে'), 'success'); })
      .catch(function (e) { toast(e.message, 'error'); }).then(function () { $('syncIc').firstChild.classList.remove('animate-spin'); });
  },
  navLeft: function () { $('navScroll').scrollBy({ left: -200, behavior: 'smooth' }); },
  navRight: function () { $('navScroll').scrollBy({ left: 200, behavior: 'smooth' }); },
  tab: function (el) { openTab(el.dataset.id); },
  goOrder: function () { showTab('order'); }, goOrders: function () { openTab('orders'); },
  copyNo: function () {
    var txt = $('orderNoTxt').textContent.trim(); if (!txt) return;
    var done = function () { toast(t('Order No copied: ', 'অর্ডার নম্বর কপি হয়েছে: ') + txt, 'success'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () {});
    else { var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta); done(); }
  },
  addRow: function () { addRow(); recalc(); },
  delRow: function (el) { delRow(el.dataset.id); },
  clearForm: function () { clearForm(); },
  pickProd: function (el) { chooseProduct(el.closest('.prow'), el.dataset.v, true); },
  submit: submit, cancelEdit: cancelEdit,
  pickClient: function (el) { var box = $('mobileAC'), it = box._res[Number(el.dataset.i)]; $('mobile').value = '0' + it.mobile.slice(3); $('clientName').value = it.clientName; $('address').value = it.address; box.classList.add('hidden'); },
  pickContact: function () {
    if (!(navigator.contacts && navigator.contacts.select)) { toast(t('Contact access is not supported on this device/browser.', 'এই ডিভাইস/ব্রাউজারে কন্টাক্ট অ্যাক্সেস সমর্থিত নয়।'), 'error'); return; }
    navigator.contacts.select(['name', 'tel'], { multiple: false }).then(function (r) {
      if (!r || !r.length) return; var c = r[0];
      if (c.tel && c.tel[0]) $('mobile').value = c.tel[0].replace(/[^\d+]/g, '');
      if (c.name && c.name[0] && !$('clientName').value) $('clientName').value = c.name[0];
      onMobile();
    }).catch(function (e) { toast(e.message || 'Contacts blocked', 'error'); });
  },
  prevMonth: function () { moveMonth(-1); }, nextMonth: function () { moveMonth(1); },
  viewMode: function (el) { S.view = el.dataset.v; LS.set('scs_view', S.view); buildFilters(); renderOrders(); },
  more: function () { S.limit += 40; renderOrders(); },
  toggleOrder: function (el) { toggleOrder(el.dataset.no); },
  toggleSum: function () { S.sumOpen = !S.sumOpen; $('sumBody').classList.toggle('hidden', !S.sumOpen); },
  editOrder: function (el) { startEdit(el.dataset.no, el.dataset.sheet); },
  printOrder: function (el) { openPr(el.dataset.no, 'print'); },
  pdfOrder: function (el) { openPr(el.dataset.no, 'pdf'); },
  tcOrder: function (el) { askPin('edit', 'Enter PIN for transport cost', 'ট্রান্সপোর্ট খরচের পিন দিন', 'User PIN or Admin PIN is required.', 'ইউজার পিন বা অ্যাডমিন পিন লাগবে।').then(function (pin) { if (pin) openTc(el.dataset.no, el.dataset.sheet, pin); }); },
  viewOrder: function (el) { var o = S.ordMap[el.dataset.no]; if (!o) return; $('vwBody').innerHTML = fullHtml(o); $('vwModal').classList.remove('hidden'); },
  vwClose: function () { $('vwModal').classList.add('hidden'); },
  tcSave: saveTc, tcClose: function () { $('tcModal').classList.add('hidden'); },
  prClose: function () { $('prModal').classList.add('hidden'); },
  prGo: function () { var p = S.pr, lh = $('prLh').checked; $('prModal').classList.add('hidden'); if (p.mode === 'pdf') pdfDownload(p.no, lh); else printOrder(p.no, lh); },
  dmPrev: function () { S.dm--; if (S.dm < 1) { S.dm = 12; S.dy--; } loadDashMonth(); }, dmNext: function () { S.dm++; if (S.dm > 12) { S.dm = 1; S.dy++; } loadDashMonth(); },
  statMonth: function (el) { S.statOpen = S.statOpen === el.dataset.ym ? '-' : el.dataset.ym; drawTotal(); },
  printSummary: printSummary,
  histDel: function (el) { histDelete([el.dataset.id]); },
  histClear: function () { popup(t('Delete ALL history? (Admin PIN required)', 'সব হিস্ট্রি মুছবেন? (অ্যাডমিন পিন লাগবে)'), { confirm: true }).then(function (ok) { if (ok) histDelete('ALL'); }); },
  popupOk: function () { closePopup(true); }, popupNo: function () { closePopup(false); }, pinClose: closePin,
  switch: function (el) { var on = !el.classList.contains('on'); el.classList.toggle('on', on); el.setAttribute('aria-checked', on ? 'true' : 'false'); },
  admTab: function (el) { S.admTab = el.dataset.id; S.aq = ''; renderAdmin(); },
  entAdd: function () { $('entForm').classList.remove('hidden'); $('entId').value = ''; ['entF0', 'entF1'].forEach(function (i) { if ($(i)) $(i).value = ''; }); if ($('packList')) { $('packList').innerHTML = packRow(''); $('noPack').checked = false; $('packBox').classList.remove('hidden'); } $('entF0').focus(); },
  entCancel: function () { $('entForm').classList.add('hidden'); },
  packAdd: function () { $('packList').insertAdjacentHTML('beforeend', packRow('')); var p = $('packList').querySelectorAll('.pk'); p[p.length - 1].focus(); },
  packDel: function (el) { var r = el.closest('.pk-row'); if ($('packList').querySelectorAll('.pk-row').length > 1) r.remove(); else r.querySelector('.pk').value = ''; },
  entEdit: function (el) {
    var kind = el.dataset.k, x = (kind === 'product' ? S.app.products : S.app.sellers).filter(function (r) { return r.id === el.dataset.id; })[0]; if (!x) return;
    $('entForm').classList.remove('hidden'); $('entId').value = x.id;
    ENT[kind].fields.forEach(function (f, i) { $('entF' + i).value = x[f] || ''; });
    if (kind === 'product') { $('packList').innerHTML = (x.packSizes.length ? x.packSizes : ['']).map(packRow).join(''); $('noPack').checked = !x.packSizes.length; $('packBox').classList.toggle('hidden', !x.packSizes.length); }
    $('entF0').focus();
  },
  entSave: function (el) {
    var kind = el.dataset.k, rec = { id: $('entId').value };
    ENT[kind].fields.forEach(function (f, i) { rec[f] = $('entF' + i).value.trim(); });
    if (kind === 'product') rec.packSizes = $('noPack').checked ? [] : Array.prototype.map.call($('packList').querySelectorAll('.pk'), function (i) { return i.value.trim(); }).filter(Boolean);
    if (!rec[ENT[kind].fields[0]]) { toast(t('Name is required', 'নাম দিন'), 'error'); return; }
    askAdmin().then(function (pin) { if (!pin) return; adm(function () { return gs('saveEntity', kind, rec, pin); }, t('Saved', 'সেভ হয়েছে'), entSaveBoot); });
  },
  entDel: function (el) {
    var kind = el.dataset.k;
    popup(t('Delete this item?', 'এই আইটেম মুছবেন?'), { confirm: true }).then(function (ok) {
      if (!ok) return;
      askAdmin().then(function (pin) { if (!pin) return; adm(function () { return gs('deleteEntity', kind, el.dataset.id, pin); }, t('Deleted', 'মুছে ফেলা হয়েছে'), entSaveBoot); });
    });
  },
  entUp: function (el) { moveEnt(el.dataset.k, Number(el.dataset.i), -1); }, entDown: function (el) { moveEnt(el.dataset.k, Number(el.dataset.i), 1); },
  entOrderSave: function (el) {
    var kind = el.dataset.k, ids = (kind === 'product' ? S.app.products : S.app.sellers).map(function (x) { return x.id; });
    askAdmin().then(function (pin) { if (!pin) return; adm(function () { return gs('reorderEntities', kind, ids, pin); }, t('Order saved', 'ক্রম সেভ হয়েছে'), function (r) { S.dirty[kind] = false; entSaveBoot(r); }); });
  },
  bkDownload: function () {
    var sc = document.querySelector('input[name=bkScope]:checked').value, val = sc === 'year' ? $('bkYear').value : (sc === 'month' ? $('bkMonth').value.replace('-', '') : '');
    adm(function () { return gs('getBackup', sc, val, S.adminPin); }, null, function (txt) {
      var url = URL.createObjectURL(new Blob([txt], { type: 'application/json' })), a = document.createElement('a'), d = new Date().toISOString().slice(0, 10);
      a.href = url; a.download = 'scs-backup-' + sc + (val ? '-' + val : '') + '-' + d + '.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      toast(t('Backup downloaded', 'ব্যাকআপ ডাউনলোড হয়েছে'), 'success');
      if (sc === 'all') { S.backupDone = true; renderAdmin(); }
    });
  },
  rsGo: function () {
    var f = $('rsFile').files[0]; if (!f) { toast(t('Choose a backup file first', 'আগে ব্যাকআপ ফাইল বাছুন'), 'error'); return; }
    var rd = new FileReader();
    rd.onload = function () {
      var d; try { d = JSON.parse(rd.result); } catch (e) { toast(t('Invalid JSON file', 'ফাইলটি সঠিক JSON নয়'), 'error'); return; }
      if (!d || d.app !== 'SCS Chemical Order') { toast(t('This is not an SCS backup file', 'এটি SCS ব্যাকআপ ফাইল নয়'), 'error'); return; }
      var rep = $('rsReplace').checked;
      popup(t('Backup: ', 'ব্যাকআপ: ') + (d.scope || '') + ' ' + (d.value || '') + '\n' + (d.orders || []).length + ' ' + t('orders', 'অর্ডার') + (d.products ? ', ' + d.products.length + ' ' + t('products', 'প্রোডাক্ট') : '') + (rep ? '\n⚠ ' + t('ALL current data will be replaced!', 'বর্তমান সব ডাটা মুছে যাবে!') : ''), { confirm: true }).then(function (ok) {
        if (!ok) return;
        askAdmin().then(function (pin) { if (!pin) return; adm(function () { return gs('restoreBackup', rd.result, rep, pin); }, null, function (r) { popup(t('Restored. Orders added: ', 'রিস্টোর হয়েছে। নতুন অর্ডার: ') + r.orders + ', ' + t('skipped: ', 'বাদ: ') + r.skipped + ', ' + t('products: ', 'প্রোডাক্ট: ') + r.products + ', ' + t('sellers: ', 'সেলার: ') + r.sellers); LS.del('scs_boot'); ACT.sync(); }); });
      });
    };
    rd.readAsText(f);
  },
  rstGo: function () {
    popup('⚠️ ' + t('RESET WILL ERASE ALL DATA (orders, products, sellers, history).\nDid you download the backup file?', 'রিসেট করলে সকল ডাটা মুছে যাবে (অর্ডার, প্রোডাক্ট, সেলার, হিস্ট্রি)।\nব্যাকআপ ফাইল ডাউনলোড করেছেন তো?'), { confirm: true }).then(function (ok) {
      if (!ok) return;
      askAdmin().then(function (pin) { if (!pin) return; adm(function () { return gs('resetApp', pin); }, t('App reset complete', 'অ্যাপ রিসেট সম্পন্ন'), function () { S.backupDone = false; S.cache = {}; S.stats = null; S.hist = null; LS.del('scs_boot'); ACT.sync(); renderAdmin(); }); });
    });
  },
  delFind: function () {
    var no = $('delNo').value.trim(); if (!no) return;
    gs('getOrderByNo', no).then(function (r) {
      if (!r.ok) { $('delPrev').innerHTML = '<div class="text-xs text-rose-600">' + t('Order not found.', 'অর্ডার পাওয়া যায়নি।') + '</div>'; return; }
      $('delPrev').innerHTML = '<div class="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-3"><div class="text-xs font-extrabold">' + esc(r.orderNo) + ' · ' + esc(r.clientName) + '</div><div class="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">' + esc(r.mobile) + ' · ' + esc(r.address) + '</div><div class="text-[11px] mt-1">' + r.items.map(function (i) { return esc(i.productName) + ' ' + fmt(i.quantity) + ' ' + esc(i.unit) + (i.packSize ? ' (' + esc(i.packSize) + ')' : ''); }).join(' · ') + '</div><div class="flex justify-end mt-2"><button type="button" data-act="delGo" data-no="' + esc(r.orderNo) + '" class="btn-p ' + K.red + '">' + ic('trash', 'w-3.5 h-3.5') + t('Delete this order', 'এই অর্ডার ডিলিট') + '</button></div></div>';
    }).catch(function (e) { toast(e.message, 'error'); });
  },
  delGo: function (el) {
    var no = el.dataset.no;
    popup(t('Delete order ' + no + ' permanently? This removes all its products.', 'অর্ডার ' + no + ' স্থায়ীভাবে ডিলিট করবেন? এর সব প্রোডাক্ট মুছে যাবে।'), { confirm: true }).then(function (ok) {
      if (!ok) return;
      askAdmin().then(function (pin) { if (!pin) return; adm(function () { return gsq('deleteOrder', no, pin); }, t('Order deleted', 'অর্ডার ডিলিট হয়েছে'), function (res) { $('delPrev').innerHTML = ''; $('delNo').value = ''; S.cache = {}; S.stats = null; gsRetry(['syncOrderBackground', no], 0).catch(function () {}); }); });
    });
  },
  bkSave: function () {
    var cfg = { enabled: isOn('abOn'), folderId: $('abFolder').value, every: $('abEvery').value, keep: $('abKeep').value };
    adm(function () { return gs('saveBackupConfig', cfg, S.adminPin); }, t('Auto backup settings saved', 'অটো ব্যাকআপ সেটিংস সেভ হয়েছে'), function () { loadAdmin(); });
  },
  bkNow: function () { adm(function () { return gs('runBackupNow', S.adminPin); }, null, function (r) { toast('☁️ ' + r.name, 'success'); loadAdmin(); }); },
  admLeft: function () { $('admTabs').scrollBy({ left: -240, behavior: 'smooth' }); },
  admRight: function () { $('admTabs').scrollBy({ left: 240, behavior: 'smooth' }); },
  ph: function (el) {
    var ta = lastTa || document.querySelector('#smsLines .sl-text'); if (!ta) return;
    var s = ta.selectionStart || ta.value.length, e = ta.selectionEnd || s;
    ta.value = ta.value.slice(0, s) + el.dataset.p + ta.value.slice(e); ta.focus(); ta.selectionStart = ta.selectionEnd = s + el.dataset.p.length;
  },
  lineUp: function (el) { moveLine(Number(el.dataset.i), -1); }, lineDown: function (el) { moveLine(Number(el.dataset.i), 1); },
  smsPreview: function () { smsPreview(false); },
  smsReset: function () { S.cfg.sms.lines = S.cfg.smsDefaultLines.map(function (l) { return Object.assign({}, l); }); $('smsLines').innerHTML = S.cfg.sms.lines.map(function (l, i) { return lineHtml(l, i, S.cfg.sms.lines.length); }).join(''); smsPreview(true); },
  smsSave: function () {
    var cfg = { enabled: isOn('smsOn'), apiUrl: $('smsUrl').value, apiKey: $('smsKey').value.trim() || '__KEEP__', senderId: $('smsSender').value, lines: readLines() };
    adm(function () { return gs('saveSmsConfig', cfg, S.adminPin); }, t('SMS settings saved', 'এসএমএস সেটিংস সেভ হয়েছে'), function (r) { Object.assign(S.cfg.sms, { lines: cfg.lines, enabled: cfg.enabled, apiUrl: cfg.apiUrl, senderId: cfg.senderId, apiKeySet: r.apiKeySet, apiKeyMasked: r.apiKeyMasked }); $('smsKey').value = ''; $('smsKey').placeholder = r.apiKeyMasked + ' (' + t('saved - leave blank to keep', 'সেভ আছে - ফাঁকা রাখলে একই থাকবে') + ')'; });
  },
  smsTestSend: function () { var n = $('smsTest').value.trim(); adm(function () { return gs('sendTestSms', n, S.adminPin); }, t('Test SMS sent', 'টেস্ট এসএমএস পাঠানো হয়েছে')); },
  smsRetry: function () { adm(function () { return gs('retryPendingSms', S.adminPin); }, null, function (r) { popup(t('Retry finished. SMS sent: ', 'পুনরায় চেষ্টা শেষ। এসএমএস গেছে: ') + (r && r.sent || 0)); S.cache = {}; }); },
  syncSave: function () {
    var cfg = { enabled: isOn('syOn'), sheetUrl: $('syUrl').value, tabName: $('syTab').value, auto: isOn('syAuto') };
    adm(function () { return gs('saveSyncConfig', cfg, S.adminPin); }, t('Sync settings saved', 'সিঙ্ক সেটিংস সেভ হয়েছে'), function () { Object.assign(S.cfg.sync, cfg); });
  },
  syncNow: function () { adm(function () { return gs('syncAllNow', S.adminPin); }, null, function (r) { popup(t('Synced. New rows: ', 'সিঙ্ক হয়েছে। নতুন রো: ') + r.added + ', ' + t('updated: ', 'আপডেট: ') + r.updated); loadAdmin(); }); },
  pdfSave: function () { var cfg = { folderId: $('pdfFolder').value, sealId: $('pdfSeal').value, letterhead: $('lhId').value }; adm(function () { return gs('savePdfConfig', cfg, S.adminPin); }, t('Saved', 'সেভ হয়েছে'), function () { S.cfg.pdf.folderId = cfg.folderId; S.cfg.pdf.sealId = cfg.sealId; S.cfg.pdf.letterheadId = cfg.letterhead; }); },
  pdfAll: uploadAllPdfs,
  pinChange: function () {
    var o = $('pinOld').value, n = $('pinNew').value, n2 = $('pinNew2').value;
    if (n !== n2) { toast(t('New PINs do not match', 'নতুন পিন মিলছে না'), 'error'); return; }
    adm(function () { return gs('changeAdminPin', o, n); }, t('Admin PIN changed', 'অ্যাডমিন পিন বদলানো হয়েছে'), function () { S.adminPin = n; S.adminLen = n.length; ['pinOld', 'pinNew', 'pinNew2'].forEach(function (id) { $(id).value = ''; }); });
  }
};

document.addEventListener('click', function (e) {
  var el = e.target.closest('[data-act]');
  if (el && ACT[el.dataset.act]) { ACT[el.dataset.act](el, e); return; }
  if (!e.target.closest('#mobileAC') && e.target.id !== 'mobile') $('mobileAC').classList.add('hidden');
  if (!e.target.closest('.prow .ac') && !(e.target.classList && e.target.classList.contains('f-name'))) document.querySelectorAll('.prow .ac').forEach(function (a) { a.classList.add('hidden'); });
});
document.addEventListener('input', function (e) {
  var el = e.target;
  if (el.classList && el.classList.contains('f-name')) onProdInput(el);
  if (el.closest && el.closest('#productRows')) recalc();
  if (el.id === 'transportFee') recalc();
  if (el.id === 'mobile') onMobile();
  if (el.id === 'sumSearch') { S.q = el.value; S.limit = 40; renderOrders(); }
  if (el.id === 'hSearch') { S.hq = el.value; renderHistory(); }
  if (el.id === 'admQ') { S.aq = el.value; var b = $('admBody'); var pos = el.selectionStart; b.innerHTML = admList(S.admTab === 'products' ? 'product' : 'seller'); var n = $('admQ'); n.focus(); n.setSelectionRange(pos, pos); }
});
document.addEventListener('change', function (e) {
  var el = e.target;
  if (el.id === 'monthSel') { S.m = Number(el.value); loadOrders(); }
  if (el.id === 'yearSel') { S.y = Number(el.value); loadOrders(); }
  if (el.id === 'lhFile') readLetterhead(el);
  if (el.id === 'sealFile') readSeal(el);
  if (el.id === 'noPack') { $('packBox').classList.toggle('hidden', el.checked); }
  if (el.id === 'fSeller') { S.seller = el.value; renderOrders(); }
  if (el.id === 'fSort') { S.sort = el.value; renderOrders(); }
});
document.addEventListener('focusin', function (e) { if (e.target.classList && e.target.classList.contains('sl-text')) lastTa = e.target; });
document.addEventListener('wheel', function (e) { var t2 = e.target; if (t2 && t2.tagName === 'INPUT' && t2.type === 'number' && document.activeElement === t2) t2.blur(); }, { passive: true, capture: true });
document.addEventListener('keydown', function (e) { var t2 = e.target; if (t2 && t2.tagName === 'INPUT' && t2.type === 'number' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) e.preventDefault(); }, true);

/* drag / wheel scrolling for horizontal strips (nav & admin sub-menu) */
(function () {
  var el = null, x0 = 0, s0 = 0, moved = false, down = false;
  document.addEventListener('mousedown', function (e) {
    var h = e.target.closest && e.target.closest('.drag-scroll'); if (!h || e.button !== 0) return;
    el = h; down = true; moved = false; x0 = e.clientX; s0 = h.scrollLeft;
  });
  window.addEventListener('mousemove', function (e) {
    if (!down || !el) return;
    var dx = e.clientX - x0;
    if (Math.abs(dx) > 5) { moved = true; el.style.scrollBehavior = 'auto'; el.scrollLeft = s0 - dx; el.style.cursor = 'grabbing'; }
  });
  window.addEventListener('mouseup', function () { if (el) { el.style.cursor = ''; el.style.scrollBehavior = ''; } down = false; setTimeout(function () { moved = false; }, 0); });
  document.addEventListener('click', function (e) { if (moved && e.target.closest && e.target.closest('.drag-scroll')) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
  document.addEventListener('wheel', function (e) {
    var h = e.target.closest && e.target.closest('.drag-scroll');
    if (!h || h.scrollWidth <= h.clientWidth) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { h.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });
})();

/* ------------------------------------------------------------------ init */
$('navScroll').classList.add('drag-scroll');
$('logoImg').src = DEFAULT_LOGO;
$('logoImg').onerror = function () { this.onerror = null; this.src = DEFAULT_LOGO; };
if (navigator.contacts && navigator.contacts.select) $('contactBtn').classList.remove('hidden');
paintIcons();
applyTheme();
applyLang();
/* SCS Management: PIN লগইন স্ক্রিন নেই — অ্যাকাউন্টের রোল দিয়ে সরাসরি অ্যাপে প্রবেশ।
   অ্যাডমিন প্যানেলে ঢুকতে Admin রোল + অ্যাডমিন পিন লাগে। */
S.role = window.SCS_ROLE === 'admin' ? 'admin' : 'user';
S.adminPin = '';
S.adminLen = String(window.SCS_ADMIN_PIN || '2026').length;
$('logoImg').setAttribute('data-scs-logo', '1');
if (window.SCS && SCS.applyLogo) SCS.applyLogo();
$('loginView').classList.add('hidden');
if (SCS.me) $('roleChip').title = SCS.me.name + ' <' + SCS.me.email + '>';
bootstrap();
})();
