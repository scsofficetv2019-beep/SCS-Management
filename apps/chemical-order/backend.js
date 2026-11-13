/* =====================================================================
 *  SCS Chemical Order — Supabase backend
 *  আগের Code.gs এর প্রতিটি ফাংশন একই নামে ও একই রিটার্ন ফরম্যাটে, কিন্তু
 *  এখন ডাটা Supabase (Postgres) এ। PIN আর নেই — অ্যাকাউন্টের রোল দিয়ে কাজ।
 *  প্রতিটি পরিবর্তন ডাটাবেস ট্রিগার দিয়ে audit_log এ (কে, কখন, আগে/পরে) জমা হয়।
 * ===================================================================== */
(function () {
  'use strict';
  var APP = 'chemical-order';
  var sb = function () { return SCS.sb; };
  var q = function (p) { return SCS.q(p); };
  var isAdmin = function () { return SCS.role === 'admin'; };
  function requireAdmin() {
    if (!isAdmin()) throw new Error(SCS.t('Admin access for Chemical Order is required.', 'এই কাজের জন্য Chemical Order-এ Admin অ্যাক্সেস লাগবে।'));
    if (!SCS.adminUnlocked) throw new Error(SCS.t('Enter the admin PIN first.', 'আগে অ্যাডমিন পিন দিন।'));
  }

  var HEADERS = [
    'Timestamp', 'Order No', 'Delivery Time & Date', 'Client or Project name', 'Mobile number', 'Address',
    'Product Name', 'Quantity', 'Unit', 'Pack Size', 'Unit Price', 'Discount Unit Price', 'Total Price',
    'Special Price', 'Transport Fee', 'SCS Transport Cost', 'Order By', 'Engineer Commission Per Unit',
    'Contractor Commission Per Unit', 'Commission Holder Name', 'Total Commission', 'SMS Status', 'PDF Status'
  ];

  var SMS_DEFAULT_LINES = [
    { id: 'intro', label: 'Intro', enabled: true, text: 'Thank you for purchasing products from Swarup Construction Solution.' },
    { id: 'dear', label: 'Greeting', enabled: true, text: 'Dear {client},' },
    { id: 'received', label: 'Order received', enabled: true, text: 'We have received your order now (Order No: {orderNo}).' },
    { id: 'products', label: 'Products', enabled: true, text: 'Your Product:\n{products}' },
    { id: 'price', label: 'Price', enabled: true, text: '{price}' },
    { id: 'address', label: 'Address', enabled: true, text: 'Delivery Address: {address}.' },
    { id: 'delivery', label: 'Delivery date', enabled: false, text: 'Delivery Date: {delivery}' },
    { id: 'mobile', label: 'Mobile', enabled: false, text: 'Mobile: {mobile}' },
    { id: 'orderby', label: 'Order by', enabled: false, text: 'Order By: {orderBy}' },
    { id: 'hotline', label: 'Hotline', enabled: true, text: 'Hotline: +8801711190271' },
    { id: 'website', label: 'Website', enabled: true, text: 'Website: swarupconstructionsolution.com' }
  ];

  var PDF = {
    DEFAULT_SEAL: '1IObOMCqQFjTKvtVwjVwYB-Lq9eDWBn9P',
    PAGE_WIDTH_MM: 215.9, PAGE_HEIGHT_MM: 279.4, SIDE_MARGIN_MM: 15, TOP_PAD_MARGIN_MM: 34.5, BOTTOM_PAD_MARGIN_MM: 19.05,
    TITLE_TOP_GAP_MM: 2, TITLE_WIDTH_MM: 55, TITLE_HEIGHT_MM: 12, INFO_HEIGHT_MM: 25, SIGN_BOTTOM_MM: 0,
    SEAL_RIGHT_MM: 4, SEAL_BOTTOM_MM: 7, SEAL_WIDTH_MM: 38, SEAL_HEIGHT_MM: 32, SEAL_OPACITY: 0.8,
    COL_SL_MM: 10, COL_DESC_MM: 75, COL_UNIT_MM: 22, COL_QTY_MM: 22, COL_UNIT_PRICE_MM: 22, COL_TOTAL_MM: 23
  };

  /* ------------------------------------------------------------ utils */
  function n(x) { var v = Number(x); return isFinite(v) ? v : 0; }
  function nStr(x) { return String(n(x)); }
  function normalizeMobile(m) {
    var d = String(m || '').trim().replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 10) return '880' + d;
    if (d.length === 11 && d.indexOf('0') === 0) return '880' + d.slice(1);
    if (d.length === 13 && d.indexOf('880') === 0) return '880' + d.slice(3);
    return '';
  }
  function tsText(iso) { return SCS.fmt(iso, 'yyyy-MM-dd HH:mm:ss'); }
  function parseDelivery(s) {
    var m = String(s || '').match(/(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?/);
    if (!m) return { date: '', time: '' };
    var t = m[2] || '';
    if (t === '00:00') t = '';
    if (t.length === 4) t = '0' + t;
    return { date: m[1], time: t };
  }
  function deliveryText(s) {
    var d = parseDelivery(s);
    if (!d.date) return String(s || '');
    return d.date + ' ' + (d.time ? d.time + ':00' : '00:00:00');
  }

  /* -------------------------------------------------- settings helpers */
  function getSetting(key, def) {
    return q(sb().from('chem_settings').select('value').eq('key', key).maybeSingle())
      .then(function (r) { return r && r.value !== null && r.value !== undefined ? r.value : def; });
  }
  function setSetting(key, value) {
    return q(sb().from('chem_settings').upsert({ key: key, value: value }));
  }
  function smsConfig() {
    return getSetting('sms', {}).then(function (s) {
      s = s || {};
      return {
        enabled: !!s.enabled, apiUrl: String(s.apiUrl || ''), senderId: String(s.senderId || ''),
        apiKeySet: !!s.apiKeySet, apiKeyMasked: String(s.apiKeyMasked || ''),
        lines: (Array.isArray(s.lines) && s.lines.length) ? s.lines : SMS_DEFAULT_LINES
      };
    });
  }
  function pdfConfig() {
    return getSetting('pdf', {}).then(function (p) { p = p || {}; return { sealUrl: p.sealUrl !== undefined ? String(p.sealUrl || '') : PDF.DEFAULT_SEAL, letterheadPath: String(p.letterheadPath || '') }; });
  }
  function sealSrc(v) {
    v = String(v || '').trim();
    if (!v) return '';
    if (/^(https?:|data:)/i.test(v)) return v;
    var m = v.match(/\/d\/([a-zA-Z0-9_-]+)/) || v.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    var id = m ? m[1] : v;
    if (/^[a-zA-Z0-9_-]{20,}$/.test(id)) return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w400';
    return v;
  }
  function maskKey(k) { k = String(k || ''); if (!k) return ''; return k.length <= 8 ? '••••••••' : k.slice(0, 3) + '••••••••' + k.slice(-3); }

  /* -------------------------------------------------- lists */
  function loadLists() {
    return Promise.all([
      q(sb().from('chem_products').select('*').order('sort_order').order('product_name')),
      q(sb().from('chem_sellers').select('*').order('sort_order').order('name'))
    ]).then(function (r) {
      return {
        products: r[0].map(function (p) { return { id: p.id, productName: p.product_name, unit: p.unit || '', packSizes: p.pack_sizes || [] }; }),
        sellers: r[1].map(function (s) { return { id: s.id, name: s.name }; })
      };
    });
  }
  function dataVersion() { return q(sb().rpc('chem_data_version')).then(function (v) { return String(v); }); }
  function listsResult() {
    return Promise.all([loadLists(), dataVersion()]).then(function (r) {
      return { ok: true, products: r[0].products, sellers: r[0].sellers, orderByList: r[0].sellers.map(function (x) { return x.name; }), ver: r[1] };
    });
  }

  /* -------------------------------------------------- orders <-> rows */
  function itemsFromPayload(p) {
    return (p.items || []).map(function (r) {
      return {
        productName: String(r.productName || ''), quantity: n(r.quantity), unit: String(r.unit || ''), packSize: String(r.packSize || ''),
        unitPrice: n(r.unitPrice), discountUnitPrice: n(r.discountUnitPrice), engCom: n(r.engCom), conCom: n(r.conCom), rowCommission: n(r.rowCommission)
      };
    });
  }
  function dbFromPayload(p) {
    return {
      delivery_at: String(p.deliveryAt || ''), client_name: String(p.clientName || ''), mobile: normalizeMobile(p.mobile),
      address: String(p.address || ''), transport_fee: n(p.transportFee), scs_transport_cost: n(p.scsTransportCost),
      order_by: String(p.orderBy || ''), commission_holder_name: String(p.commissionHolderName || ''), items: itemsFromPayload(p)
    };
  }
  /** একটি অর্ডার -> শিটের মতো রো (প্রতি প্রোডাক্টে একটি) */
  function orderRows(o) {
    var items = (o.items && o.items.length) ? o.items : [{}];
    return items.map(function (r, idx) {
      var qty = n(r.quantity), up = n(r.unitPrice), dup = n(r.discountUnitPrice), sp = qty * dup;
      return [
        tsText(o.created_at), o.order_no, deliveryText(o.delivery_at), o.client_name || '', o.mobile || '', o.address || '',
        r.productName || '', qty, r.unit || '', r.packSize || '', up, dup,
        sp + (idx === 0 ? n(o.transport_fee) : 0), sp,
        idx === 0 ? n(o.transport_fee) : 0, idx === 0 ? n(o.scs_transport_cost) : 0,
        o.order_by || '', n(r.engCom), n(r.conCom), o.commission_holder_name || '', n(r.rowCommission),
        o.sms_status || 'Pending', o.pdf_status || 'Not Uploaded'
      ];
    });
  }
  function fetchOrder(orderNo) {
    return q(sb().from('chem_orders').select('*').eq('order_no', String(orderNo || '').trim()).maybeSingle());
  }
  function orderObj(o) {
    if (!o) return { ok: false };
    var d = parseDelivery(o.delivery_at), first = (o.items || [])[0] || {};
    return {
      ok: true, orderNo: o.order_no, sheetName: 'SCS Order', deliveryDate: d.date, deliveryTime: d.time,
      clientName: o.client_name || '', mobile: o.mobile || '', address: o.address || '',
      transportFee: n(o.transport_fee) || '', scsTransportCost: n(o.scs_transport_cost) || '', orderBy: o.order_by || '',
      engineerCommissionPerUnit: first.engCom || '', contractorCommissionPerUnit: first.conCom || '',
      commissionHolderName: o.commission_holder_name || '',
      totalCommission: (o.items || []).reduce(function (s, i) { return s + n(i.rowCommission); }, 0) || '',
      smsStatus: o.sms_status || 'Pending', pdfStatus: o.pdf_status || 'Not Uploaded',
      items: (o.items || []).map(function (i) {
        var qty = n(i.quantity);
        return {
          productName: i.productName || '', quantity: i.quantity || '', unit: i.unit || '', packSize: i.packSize || '',
          unitPrice: i.unitPrice || '', discountUnitPrice: i.discountUnitPrice || '', totalPrice: qty * n(i.unitPrice) || '',
          specialPrice: qty * n(i.discountUnitPrice) || '', engCom: i.engCom === 0 ? '' : (i.engCom || ''), conCom: i.conCom === 0 ? '' : (i.conCom || ''),
          rowCommission: i.rowCommission || ''
        };
      })
    };
  }
  function snapOrder(o) {
    if (!o) return null;
    return {
      delivery: String(o.delivery_at || ''), client: String(o.client_name || ''), mobile: String(o.mobile || ''), address: String(o.address || ''),
      transportFee: nStr(o.transport_fee), scsTransportCost: nStr(o.scs_transport_cost), orderBy: String(o.order_by || ''),
      commissionHolder: String(o.commission_holder_name || ''), smsStatus: o.sms_status, pdfStatus: o.pdf_status,
      items: (o.items || []).map(function (i) {
        return [i.productName, nStr(i.quantity) + ' ' + (i.unit || ''), i.packSize, 'Price ' + nStr(i.unitPrice), 'Disc ' + nStr(i.discountUnitPrice), 'Eng ' + nStr(i.engCom), 'Con ' + nStr(i.conCom)].join(' | ');
      })
    };
  }

  /* -------------------------------------------------- edited marks (from audit log) */
  var STATUS_ONLY = { sms_status: 1, pdf_status: 1, pdf_path: 1 };
  function editedMap() {
    return q(sb().from('audit_log').select('at, record_ref, changed_fields').eq('app_key', APP).eq('table_name', 'chem_orders').eq('action', 'Edit').order('id', { ascending: false }).limit(5000))
      .then(function (rows) {
        var out = {}, now = Date.now(), cutE = now - 72 * 3600e3, cutT = now - 24 * 3600e3;
        rows.forEach(function (r) {
          var f = (r.changed_fields || []).filter(function (k) { return !STATUS_ONLY[k]; });
          if (!f.length) return;
          var isT = f.length === 1 && f[0] === 'scs_transport_cost';
          var t = new Date(r.at).getTime(), lbl = SCS.fmt(r.at, 'd MMM HH:mm');
          var m = out[r.record_ref] = out[r.record_ref] || { e: 0, et: '', t: 0, tt: '' };
          if (isT) { m.t++; if (t >= cutT && !m.tt) m.tt = lbl; } else { m.e++; if (t >= cutE && !m.et) m.et = lbl; }
        });
        return out;
      }).catch(function () { return {}; });
  }

  /* -------------------------------------------------- SMS text (preview) */
  function formatTaka(v) { return Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }).replace(/\.00$/, ''); }
  function renderSmsText(cfg, d) {
    var total = formatTaka(d.total), transport = formatTaka(d.transport);
    var price = d.transport > 0 ? 'Total Price: ' + total + ' Taka with ' + transport + ' taka Transport Fee.' : 'Total Price: ' + total + ' Taka.';
    var map = {
      client: d.client || 'Customer', orderNo: d.orderNo || '', products: (d.productLines && d.productLines.length) ? d.productLines.join('\n') : '-',
      price: price, total: total, transport: transport, address: d.address || '-', delivery: d.delivery || '-', mobile: d.mobile || '', orderBy: d.orderBy || '-'
    };
    return (cfg.lines || []).filter(function (l) { return l.enabled; }).map(function (l) {
      return String(l.text || '').replace(/\{(\w+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : m; });
    }).filter(function (s) { return String(s).trim() !== ''; }).join('\n');
  }

  /* -------------------------------------------------- PDF (bill & challan) */
  function esc_(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function num_(v) { v = Number(v || 0); if (isNaN(v)) return '0'; return String(Math.round(v * 100) / 100).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1'); }
  function packNum(t) { var m = String(t || '').match(/\d+(\.\d+)?/); return m ? Number(m[0]) : 0; }
  function takaWords(amount) {
    var x = Math.round(Number(amount || 0));
    if (!x || x < 0) return '';
    var ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    var teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    var tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    function two(v) { if (v < 10) return ones[v]; if (v < 20) return teens[v - 10]; var t = Math.floor(v / 10), o = v % 10; return tens[t] + (o ? ' ' + ones[o] : ''); }
    function three(v) { var h = Math.floor(v / 100), r = v % 100, l = h ? ones[h] + ' hundred' : '', rr = r ? two(r) : ''; return (l && rr) ? l + ' ' + rr : (l || rr); }
    var crore = Math.floor(x / 10000000); x %= 10000000;
    var lakh = Math.floor(x / 100000); x %= 100000;
    var th = Math.floor(x / 1000); x %= 1000;
    var parts = [];
    if (crore) parts.push(three(crore) + ' crore');
    if (lakh) parts.push(three(lakh) + ' lakh');
    if (th) parts.push(three(th) + ' thousand');
    if (x) parts.push(three(x));
    var text = parts.join(' ').replace(/\s+/g, ' ').trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) + ' taka only' : '';
  }
  function orderData(o) {
    var items = (o.items || []).map(function (it, idx) {
      var qty = n(it.quantity), up = n(it.unitPrice), dup = n(it.discountUnitPrice);
      return { sl: idx + 1, productName: it.productName || '', quantity: qty, unit: it.unit || '', packSize: String(it.packSize || ''), unitPrice: up, discountUnitPrice: dup, total: qty * up, special: qty * dup };
    });
    var transport = n(o.transport_fee);
    var gross = items.reduce(function (s, i) { return s + i.total; }, 0), special = items.reduce(function (s, i) { return s + i.special; }, 0);
    var d = parseDelivery(o.delivery_at), dateText = '';
    if (d.date) dateText = SCS.fmt(new Date(d.date + 'T12:00:00+06:00'), 'd MMM yyyy');
    return {
      orderNo: o.order_no, orderBy: String(o.order_by || ''), dateText: dateText, clientName: o.client_name || '', mobile: o.mobile || '',
      sideName: o.address || '', address: o.address || '', items: items, grossTotal: gross, specialGross: special,
      discountAmount: Math.max(0, gross - special), transport: transport, netPay: special + transport, inWords: takaWords(special + transport)
    };
  }
  function pdfCss() {
    var P = PDF;
    return ('@page{size:__W__mm __H__mm;margin:0}*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}' +
      '.page{position:relative;width:__W__mm;height:__H__mm;background:transparent;font-family:"Times New Roman",serif;color:#000}' +
      '.content{position:absolute;left:__S__mm;right:__S__mm;top:__T__mm;bottom:__B__mm}' +
      '.title-row{position:relative;display:block;margin-top:__TG__mm;margin-bottom:2.2mm;height:__TH__mm}' +
      '.title-box{width:__TW__mm;height:__TH__mm;border:1px solid #333;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:5.8mm;letter-spacing:.1mm;margin:0 auto}' +
      '.sl-no{color:#2f64c7;font-size:3.9mm;font-weight:700;white-space:nowrap;position:absolute;right:0;top:1.2mm}' +
      '.info{border:1px solid #333;display:grid;grid-template-columns:1fr 1.08fr;margin-bottom:2mm}' +
      '.info-left,.info-right{padding:1mm 1.6mm;font-size:3.95mm;line-height:1.22;min-height:__IH__mm}' +
      '.info-right{border-left:1px solid #333;background-color:#acd0e8!important}' +
      '.info-right-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:3.95mm}' +
      '.info-right-table td{border:0;padding:.2mm 0;vertical-align:top;white-space:nowrap}' +
      '.info-right-table .k{font-weight:700;width:28%}.info-right-table .k-date{width:18%;padding-left:2.5mm}' +
      '.info-right-table .colon{width:4%;text-align:center;font-weight:700}.info-right-table .v{width:14%}.info-right-table .date{width:32%;font-weight:700}' +
      '.label{font-weight:700;display:inline-block;min-width:29mm}' +
      '.main-table{width:100%;border-collapse:collapse;font-size:3.9mm}' +
      '.main-table th,.main-table td{border:1px solid #333;padding:.7mm 1mm;vertical-align:top}' +
      '.main-table thead th{text-align:center;font-weight:700;font-size:3.55mm;line-height:1.02}' +
      '.item-lines{position:relative;height:100%}' +
      '.item-line{min-height:7mm;line-height:7mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.item-line.c{text-align:center}.item-line.l{text-align:left}' +
      '.sign-row{position:absolute;left:0;right:0;bottom:__SB__mm;display:flex;justify-content:space-between;font-size:3.4mm;z-index:3}' +
      '.sign-line{border-top:1px solid #333;padding-top:.6mm;min-width:34mm;text-align:center;font-weight:700}' +
      '.sign-row .sign-line:last-child{min-width:74mm;text-align:center}')
      .replace(/__W__/g, P.PAGE_WIDTH_MM).replace(/__H__/g, P.PAGE_HEIGHT_MM).replace(/__S__/g, P.SIDE_MARGIN_MM)
      .replace(/__T__/g, P.TOP_PAD_MARGIN_MM).replace(/__B__/g, P.BOTTOM_PAD_MARGIN_MM).replace(/__TG__/g, P.TITLE_TOP_GAP_MM)
      .replace(/__TW__/g, P.TITLE_WIDTH_MM).replace(/__TH__/g, P.TITLE_HEIGHT_MM).replace(/__IH__/g, P.INFO_HEIGHT_MM).replace(/__SB__/g, P.SIGN_BOTTOM_MM);
  }
  function copyHtml(o, title, opts) {
    var P = PDF, items = o.items || [], isBill = title === 'BILL';
    var line = function (cls, v, extra) { return '<div class="item-line ' + cls + '"' + (extra ? ' style="' + extra + '"' : '') + '>' + v + '</div>'; };
    var remark = function (it) { var pk = packNum(it.packSize), qty = n(it.quantity); if (!pk || !qty) return ''; var c = qty / pk; return pk + '×' + (Number.isInteger(c) ? String(c) : String(Math.round(c * 100) / 100)); };
    var sl = items.map(function (_, i) { return line('c', i + 1); }).join('');
    var dsc = items.map(function (it) { return line('l', esc_(it.productName)); }).join('');
    var un = items.map(function (it) { return line('c', esc_(it.unit)); }).join('');
    var qt = items.map(function (it) { return line('c', num_(it.quantity)); }).join('');
    var upl = items.map(function (it) { return line('c', num_(it.unitPrice)); }).join('');
    var tot = items.map(function (it) { return line('c', num_(it.total)); }).join('');
    var rem = items.map(function (it) { return line('c', esc_(remark(it))); }).join('');
    var eD = '', eU = '', eQ = '', eP = '', eT = '';
    var extra = function (label, amt) { eD += line('l', label, 'font-weight:700'); eU += line('c', '-'); eQ += line('c', '-'); eP += line('c', '-'); eT += line('c', num_(amt), 'font-weight:700'); };
    if (isBill && o.discountAmount > 0) extra('Special Discount', o.discountAmount);
    if (isBill && o.transport > 0) extra('Transport Fee', o.transport);
    var th = function (w, t) { return '<th style="width:' + w + 'mm">' + t + '</th>'; };
    var td = function (c) { return '<td style="height:106mm"><div class="item-lines">' + c + '</div></td>'; };
    var lh = opts.lhUri ? '<img src="' + opts.lhUri + '" style="position:absolute;left:0;top:0;width:100%;height:100%;z-index:0">' : '';
    var ob = o.orderBy ? '<div style="margin-top:2.5mm;font-size:3.8mm;text-align:left;font-weight:700">Order by : <span style="font-weight:400">' + esc_(o.orderBy) + '</span></div>' : '';
    var seal = opts.seal ? '<div style="position:absolute;right:' + (P.SEAL_RIGHT_MM + P.SIDE_MARGIN_MM) + 'mm;bottom:' + (P.BOTTOM_PAD_MARGIN_MM + P.SEAL_BOTTOM_MM) + 'mm;width:' + P.SEAL_WIDTH_MM + 'mm;height:' + P.SEAL_HEIGHT_MM + 'mm;text-align:center;line-height:' + P.SEAL_HEIGHT_MM + 'mm;z-index:1;overflow:hidden"><img src="' + opts.seal + '" crossorigin="anonymous" style="max-width:' + P.SEAL_WIDTH_MM + 'mm;max-height:' + P.SEAL_HEIGHT_MM + 'mm;vertical-align:middle;opacity:' + P.SEAL_OPACITY + '"></div>' : '';
    var table = isBill
      ? '<table class="main-table"><thead><tr>' + th(P.COL_SL_MM, 'SL No') + th(P.COL_DESC_MM, 'DESCRIPTION OF ITEAM') + th(P.COL_UNIT_MM, 'UNIT') + th(P.COL_QTY_MM, 'QUANTITY') + th(P.COL_UNIT_PRICE_MM, 'UNIT PRICE') + th(P.COL_TOTAL_MM, 'TOTAL AMOUNT') + '</tr></thead><tbody>' +
        '<tr>' + td(sl) + td(dsc + eD) + td(un + eU) + td(qt + eQ) + td(upl + eP) + td(tot + eT) + '</tr>' +
        '<tr><td colspan="5" style="font-weight:700;"><b>Taka (In Word) :</b> ' + esc_(o.inWords) + '</td><td style="text-align:center;font-weight:700;"><b>' + num_(o.netPay) + '</b></td></tr></tbody></table>'
      : '<table class="main-table"><thead><tr>' + th(P.COL_SL_MM, 'SL No') + th(P.COL_DESC_MM, 'DESCRIPTION OF ITEAM') + th(P.COL_UNIT_MM, 'UNIT') + th(P.COL_QTY_MM, 'QUANTITY') + th(P.COL_UNIT_PRICE_MM + P.COL_TOTAL_MM, 'REMARK') + '</tr></thead><tbody>' +
        '<tr>' + td(sl) + td(dsc) + td(un) + td(qt) + td(rem) + '</tr></tbody></table>';
    return '<div class="page">' + lh + '<div class="content">' +
      '<div class="title-row"><div class="title-box">' + title + '</div><div class="sl-no">SL No : ' + esc_(o.orderNo) + '</div></div>' +
      '<div class="info"><div class="info-left"><div><span class="label">Delivered To :</span> ' + esc_(o.clientName) + '</div><div><span class="label">Mobile Number :</span> ' + esc_(o.mobile) + '</div><div><span class="label">Name of the Side:</span> ' + esc_(o.sideName || o.address) + '</div></div>' +
      '<div class="info-right"><table class="info-right-table">' +
      '<tr><td class="k">Bill No</td><td class="colon">:</td><td class="v">01</td><td class="k k-date">Date</td><td class="colon">:</td><td class="v date">' + esc_(o.dateText) + '</td></tr>' +
      '<tr><td class="k">Challan No</td><td class="colon">:</td><td class="v">01</td><td class="k k-date">Date</td><td class="colon">:</td><td class="v"></td></tr>' +
      '<tr><td class="k">P.O. No</td><td class="colon">:</td><td class="v"></td><td class="k k-date">Date</td><td class="colon">:</td><td class="v"></td></tr></table></div></div>' +
      table + ob + '<div class="sign-row"><div class="sign-line">Received by :</div><div class="sign-line">For: SWARUP CONSTRUCTION SOLUTION</div></div></div>' + seal + '</div>';
  }
  function bundleHtml(o, opts) {
    var css = '<style>' + pdfCss() + 'html,body{margin:0;padding:0;background:#fff}.pg{width:215.9mm;height:279.4mm;overflow:hidden;break-after:page;page-break-after:always}.pg:last-child{break-after:auto;page-break-after:auto}</style>';
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=215.9mm"><title>Bill & challan ' + esc_(o.orderNo) + '</title>' + css + '</head><body>' +
      '<div class="pg">' + copyHtml(o, 'BILL', opts) + '</div><div class="pg">' + copyHtml(o, 'CHALLAN', opts) + '</div></body></html>';
  }
  function letterheadUri() {
    return pdfConfig().then(function (c) {
      if (!c.letterheadPath) throw new Error('Letterhead pad is not set (Admin > PDF & Letterhead).');
      return SCS.download(c.letterheadPath).then(SCS.blobToDataUrl);
    });
  }
  function toDataUrlSafe(url) {
    if (!url || /^data:/.test(url)) return Promise.resolve(url || '');
    return fetch(url, { mode: 'cors' }).then(function (r) { if (!r.ok) throw new Error(); return r.blob(); }).then(SCS.blobToDataUrl).catch(function () { return ''; });
  }
  function htmlOpts(letterhead, forPdf) {
    return pdfConfig().then(function (c) {
      var raw = String(c.sealUrl || ''), seal;
      if (raw.indexOf('storage:') === 0) seal = SCS.download(raw.slice(8)).then(SCS.blobToDataUrl).catch(function () { return ''; });
      else { var u = sealSrc(raw); seal = forPdf ? toDataUrlSafe(u) : u; }
      return Promise.all([letterhead ? letterheadUri() : '', seal]).then(function (r) { return { lhUri: r[0], seal: r[1] }; });
    });
  }
  var H2P_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
  /** অর্ডার -> PDF Blob (ব্রাউজারেই তৈরি হয়)।
   *  আলাদা iframe-এ রেন্ডার হয়, যাতে অ্যাপের Tailwind স্টাইল (oklch রং) PDF লাইব্রেরিতে সমস্যা না করে। */
  function makePdfBlob(o, letterhead) {
    return htmlOpts(letterhead, true).then(function (opts) {
      var od = orderData(o);
      return new Promise(function (resolve, reject) {
        var fr = document.createElement('iframe');
        fr.setAttribute('aria-hidden', 'true');
        fr.setAttribute('style', 'position:fixed;left:-10000px;top:0;width:820px;height:1100px;border:0;visibility:hidden');
        var done = function (err, blob) { setTimeout(function () { fr.remove(); }, 0); if (err) reject(err); else resolve(blob); };
        var timer = setTimeout(function () { done(new Error('PDF তৈরি হতে বেশি সময় লাগছে (timeout)')); }, 60000);
        fr.onload = function () {
          var w = fr.contentWindow;
          var go = function () {
            if (!w.html2pdf) { clearTimeout(timer); done(new Error('PDF library লোড হয়নি')); return; }
            var pages = w.document.querySelectorAll('.pg');
            var worker = w.html2pdf().set({ margin: 0, image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' }, jsPDF: { unit: 'mm', format: [215.9, 279.4], orientation: 'portrait' } })
              .from(pages[0]).toPdf();
            worker = worker.get('pdf').then(function (pdf) { pdf.addPage([215.9, 279.4], 'portrait'); }).from(pages[1]).toContainer().toCanvas().toPdf();
            worker.output('arraybuffer').then(function (buf) {
              clearTimeout(timer); done(null, new Blob([buf], { type: 'application/pdf' }));
            }, function (e) { clearTimeout(timer); done(e); });
          };
          if (w.html2pdf) go(); else { var s = w.document.querySelector('script'); s.onload = go; s.onerror = go; }
        };
        fr.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><style>' + pdfCss() +
          'html,body{margin:0;padding:0;background:#fff}.pg{width:215.9mm;height:279.4mm;overflow:hidden;background:#fff}</style>' +
          '<script src="' + H2P_URL + '"><\/script></head><body>' +
          '<div class="pg">' + copyHtml(od, 'BILL', opts) + '</div><div class="pg">' + copyHtml(od, 'CHALLAN', opts) + '</div></body></html>';
        document.body.appendChild(fr);
      });
    });
  }
  function pdfPath(orderNo) { return APP + '/pdf/' + String(orderNo).replace(/[^0-9A-Za-z_-]/g, '_') + '.pdf'; }
  function uploadOrderPdf(o) {
    return makePdfBlob(o, false).then(function (blob) {
      var path = pdfPath(o.order_no);
      return SCS.upload(path, blob, 'application/pdf').then(function () {
        return q(sb().from('chem_orders').update({ pdf_status: 'Pdf Uploaded', pdf_path: path }).eq('order_no', o.order_no));
      }).then(function () { return { ok: true, path: path }; });
    });
  }

  /* ================================================================ API */
  var B = {};

  /* ---- login / pins (এখন অ্যাকাউন্ট-ভিত্তিক) ---- */
  B.getLoginInfo = function () { return { adminLen: 4 }; };
  B.verifyLogin = function () { return { ok: true, role: SCS.role }; };
  B.verifyEditPin = function () { return { ok: true }; };
  B.verifyAdminPin = function (pin) { return { ok: SCS.checkAdminPin(pin) }; };
  B.changeAdminPin = function () { throw new Error('PIN আর নেই — অ্যাক্সেস এখন SCS Management অ্যাকাউন্ট দিয়ে নিয়ন্ত্রিত হয়।'); };

  /* ---- bootstrap ---- */
  B.getBootstrapData = function () {
    return Promise.all([
      loadLists(), q(sb().rpc('chem_next_order_no')), dataVersion(),
      q(sb().from('chem_orders').select('items').order('created_at', { ascending: false }).limit(400))
    ]).then(function (r) {
      var last = {};
      r[3].slice().reverse().forEach(function (o) {
        (o.items || []).forEach(function (i) { if (i.productName) last[i.productName] = { up: i.unitPrice || '', dup: i.discountUnitPrice || '', eng: i.engCom || '', con: i.conCom || '' }; });
      });
      return {
        nextOrderNo: r[1], products: r[0].products, sellers: r[0].sellers, orderByList: r[0].sellers.map(function (x) { return x.name; }),
        lastPrices: last, availableSheets: [], ver: r[2]
      };
    });
  };
  B.getNextOrderNo = function () { return q(sb().rpc('chem_next_order_no')); };
  B.getDataVersion = function () { return dataVersion(); };
  B.getLists = function () { return listsResult(); };

  /* ---- orders ---- */
  B.submitOrder = function (payload) {
    if (payload.mode === 'resubmit') {
      var no = String(payload.orderNo || '').trim();
      if (!no) return { ok: false, error: 'Order No required' };
      return fetchOrder(no).then(function (o) {
        if (!o) return { ok: false, error: 'Order not found' };
        return q(sb().from('chem_orders').update({ scs_transport_cost: n(payload.scsTransportCost) }).eq('order_no', no)).then(function () { return { ok: true, orderNo: no, bg: 'sync' }; });
      });
    }
    if (!(payload.items || []).length) return { ok: false, error: 'At least one product required' };
    if (!normalizeMobile(payload.mobile)) return { ok: false, error: 'Valid Mobile Number is required' };
    return q(sb().rpc('chem_create_order', { p: dbFromPayload(payload) })).then(function (orderNo) {
      // নতুন অর্ডারের নোটিফিকেশন সবার ফোন/কম্পিউটারে পুশ
      if (SCS.push && SCS.push.dispatch) setTimeout(SCS.push.dispatch, 300);
      return { ok: true, orderNo: orderNo, bg: true };
    });
  };

  B.updateOrder = function (payload) {
    var no = String(payload.orderNo || '').trim();
    if (!no) return { ok: false, error: 'Order No required' };
    if (!(payload.items || []).length) return { ok: false, error: 'At least one product required' };
    if (!normalizeMobile(payload.mobile)) return { ok: false, error: 'Valid Mobile Number is required' };
    return fetchOrder(no).then(function (old) {
      if (!old) throw new Error('Order not found');
      var upd = dbFromPayload(payload);
      var changed = JSON.stringify(snapOrder(Object.assign({}, old, upd, { sms_status: old.sms_status, pdf_status: old.pdf_status }))) !== JSON.stringify(snapOrder(old));
      if (changed) upd.pdf_status = 'Not Uploaded';
      return q(sb().from('chem_orders').update(upd).eq('order_no', no)).then(function () {
        return { ok: true, orderNo: no, bg: true, needSms: String(old.sms_status || '').indexOf('Sent') === -1 };
      });
    });
  };

  B.getOrderByNo = function (orderNo) { return fetchOrder(orderNo).then(orderObj); };

  B.searchClientByMobile = function (mobile) {
    var d = String(mobile || '').replace(/\D/g, '').replace(/^880/, '').replace(/^0/, '');
    if (d.length < 4) return { ok: false, results: [] };
    return q(sb().from('chem_orders').select('mobile, client_name, address, created_at').ilike('mobile', '%' + d + '%').order('created_at', { ascending: false }).limit(300))
      .then(function (rows) {
        var map = {}, order = [];
        rows.forEach(function (r) {
          var m = normalizeMobile(r.mobile); if (!m) return;
          var key = m + '||' + (r.client_name || '').trim() + '||' + (r.address || '').trim();
          if (!map[key]) { map[key] = { mobile: m, clientName: (r.client_name || '').trim(), address: (r.address || '').trim(), orders: 0, last: SCS.fmt(r.created_at, 'd MMM yyyy') }; order.push(key); }
          map[key].orders++;
        });
        return { ok: true, results: order.slice(0, 8).map(function (k) { return map[k]; }) };
      });
  };

  B.getSummary = function (filters) {
    var ym = filters && filters.yearMonth ? String(filters.yearMonth) : '';
    var qq = sb().from('chem_orders').select('*').order('order_no');
    if (ym) qq = qq.like('order_no', ym + '-%');
    return Promise.all([q(qq), dataVersion(), editedMap()]).then(function (r) {
      var rows = [];
      r[0].forEach(function (o) { rows = rows.concat(orderRows(o)); });
      return { headers: HEADERS, rows: rows, sheetName: 'SCS Order', lastUpdated: r[1] + '_' + (ym || 'all'), edited: r[2] };
    });
  };

  B.getAllStats = function () {
    return q(sb().from('chem_orders').select('order_no, created_at, order_by, transport_fee, items').limit(100000)).then(function (orders) {
      var months = {}, days = {}, sellers = {}, products = {}, total = { orders: 0, qty: 0, sales: 0, comm: 0, transport: 0 };
      orders.forEach(function (o) {
        var no = o.order_no; if (!/^\d{6}-/.test(no)) return;
        var ym = no.slice(0, 6), day = SCS.fmt(o.created_at, 'yyyy-MM-dd'), tr = n(o.transport_fee);
        var m = months[ym] = months[ym] || { ym: ym, orders: 0, qty: 0, sales: 0, comm: 0, transport: 0 };
        var d = days[day] = days[day] || { o: 0, s: 0, q: 0 };
        var sn = String(o.order_by || 'Unknown').trim() || 'Unknown', se = sellers[sn] = sellers[sn] || { name: sn, orders: 0, qty: 0, sales: 0, comm: 0 };
        m.orders++; d.o++; se.orders++; total.orders++;
        (o.items || []).forEach(function (it, idx) {
          var qty = n(it.quantity), sp = qty * n(it.discountUnitPrice), cm = n(it.rowCommission), t = idx === 0 ? tr : 0;
          var pn = String(it.productName || '').trim(), pr = pn ? (products[pn] = products[pn] || { name: pn, unit: String(it.unit || ''), qty: 0, sales: 0, orders: 0 }) : null;
          m.qty += qty; m.sales += sp + t; m.comm += cm; m.transport += t;
          d.s += sp + t; d.q += qty;
          se.qty += qty; se.sales += sp + t; se.comm += cm;
          if (pr) { pr.qty += qty; pr.sales += sp; pr.orders++; }
          total.qty += qty; total.sales += sp + t; total.comm += cm; total.transport += t;
        });
        if (!(o.items || []).length) { m.sales += tr; m.transport += tr; total.sales += tr; total.transport += tr; }
      });
      var byS = function (a, b) { return b.sales - a.sales; };
      return {
        ok: true, total: total, days: days, months: Object.keys(months).sort().reverse().map(function (k) { return months[k]; }),
        sellers: Object.keys(sellers).map(function (k) { return sellers[k]; }).sort(byS), products: Object.keys(products).map(function (k) { return products[k]; }).sort(byS)
      };
    });
  };

  B.setTransportCost = function (orderNo, cost) {
    var no = String(orderNo || '').trim();
    return fetchOrder(no).then(function (o) {
      if (!o) throw new Error('Order not found');
      return q(sb().from('chem_orders').update({ scs_transport_cost: n(cost) }).eq('order_no', no));
    }).then(function () { return { ok: true, orderNo: no, bg: 'sync' }; });
  };

  B.deleteOrder = function (orderNo) {
    requireAdmin();
    var no = String(orderNo || '').trim();
    if (!no) throw new Error('Order No required');
    return fetchOrder(no).then(function (o) {
      if (!o) throw new Error('Order not found');
      return q(sb().from('chem_orders').delete().eq('order_no', no)).then(function () {
        if (o.pdf_path) SCS.removeFile(o.pdf_path).catch(function () {});
        return { ok: true, orderNo: no, rows: (o.items || []).length || 1, bg: 'sync' };
      });
    });
  };

  /* ---- after submit/edit: SMS + PDF ---- */
  B.finishOrderBackground = function (orderNo, sendSms) {
    var no = String(orderNo), res = { ok: true, orderNo: no, pdfUploaded: false, pdfError: '', smsStatus: '', smsError: '', syncStatus: 'off' };
    var smsP = sendSms
      ? SCS.callFn('send-sms', { orderNo: no }).then(function (r) { res.smsStatus = (r && r.status) || ''; }, function (e) { res.smsError = e.message; })
      : Promise.resolve();
    return smsP.then(function () { return fetchOrder(no); }).then(function (o) {
      if (!o) throw new Error('Order not found');
      return uploadOrderPdf(o).then(function () { res.pdfUploaded = true; }, function (e) { res.pdfError = SCS.err(e); });
    }).then(function () { return res; });
  };
  B.syncOrderBackground = function () { return { ok: true, syncStatus: 'off' }; };

  B.generateAndUploadAllOrderPdfs = function () {
    return q(sb().from('chem_orders').select('*').order('order_no')).then(function (orders) {
      if (!orders.length) return { ok: false, error: 'No orders found' };
      var created = 0, failed = [], chain = Promise.resolve();
      orders.forEach(function (o) {
        chain = chain.then(function () { return uploadOrderPdf(o).then(function () { created++; }, function (e) { failed.push({ orderNo: o.order_no, error: SCS.err(e) }); }); });
      });
      return chain.then(function () {
        return { ok: true, total: orders.length, created: created, failed: failed.length ? failed : undefined, message: 'Uploaded ' + created + ' of ' + orders.length + ' PDF(s)' + (failed.length ? ' (' + failed.length + ' failed)' : '') };
      });
    });
  };

  B.generateInstantHtmlContent = function (orderNo, letterhead) {
    return fetchOrder(orderNo).then(function (o) {
      if (!o) throw new Error('Order not found.');
      return htmlOpts(!!letterhead, false).then(function (opts) {
        return { ok: true, html: bundleHtml(orderData(o), opts), orderNo: o.order_no };
      });
    }).catch(function (e) { return { ok: false, error: SCS.err(e) }; });
  };

  B.downloadOrderPdf = function (orderNo, letterhead) {
    return fetchOrder(orderNo).then(function (o) {
      if (!o) return { ok: false, error: 'Order not found' };
      return makePdfBlob(o, !!letterhead).then(SCS.blobToDataUrl).then(function (u) {
        return { ok: true, name: 'Bill & challan ' + o.order_no + '.pdf', data: u.split(',')[1] };
      });
    });
  };

  /* ---- history (audit log) ---- */
  function histItem(h) {
    var tbl = h.table_name, before = h.old_data, after = h.new_data, action = h.action;
    if (tbl === 'chem_orders') {
      before = snapOrder(before); after = snapOrder(after);
      var f = (h.changed_fields || []).filter(function (k) { return k !== 'updated_at' && k !== 'updated_by'; });
      if (action === 'Edit' && f.length === 1 && f[0] === 'scs_transport_cost') action = 'Transport';
      else if (action === 'Edit' && f.every(function (k) { return STATUS_ONLY[k]; })) action = 'Status';
    } else if (tbl === 'chem_products') {
      var pp = function (p) { return p ? { productName: p.product_name, unit: p.unit, packs: (p.pack_sizes || []).join('|') } : null; };
      before = pp(before); after = pp(after);
      if (action === 'Edit' && (h.changed_fields || []).join() === 'sort_order') action = 'Reorder';
    } else if (tbl === 'chem_sellers') {
      var ss = function (s) { return s ? { name: s.name } : null; };
      before = ss(before); after = ss(after);
      if (action === 'Edit' && (h.changed_fields || []).join() === 'sort_order') action = 'Reorder';
    } else if (tbl === 'chem_settings') {
      before = before ? before.value : null; after = after ? after.value : null;
      if (before && typeof before === 'object' && !Array.isArray(before)) before = Object.assign({}, before);
      if (after && typeof after === 'object' && !Array.isArray(after)) after = Object.assign({}, after);
      [before, after].forEach(function (x) { if (x && x.lines) x.lines = x.lines.filter(function (l) { return l.enabled; }).map(function (l) { return l.text; }); });
    }
    return {
      id: String(h.id), time: SCS.fmt(h.at, 'yyyy-MM-dd HH:mm:ss'), entity: h.entity, ref: h.record_ref || '',
      action: action, before: before, after: after, by: (h.actor_name || 'System') + (h.actor_email && h.actor_email !== h.actor_name ? ' <' + h.actor_email + '>' : '')
    };
  }
  B.getHistory = function (limit) {
    return q(sb().from('audit_log').select('*').eq('app_key', APP).order('id', { ascending: false }).limit(Math.min(Number(limit) || 300, 2000)))
      .then(function (rows) { return { ok: true, items: rows.map(histItem) }; });
  };
  B.deleteHistory = function () {
    throw new Error('হিস্ট্রি এখন লাইফটাইম ও স্থায়ী — কেউ মুছতে পারবে না (কে কী করেছে তার নিশ্চয়তার জন্য)।');
  };

  /* ---- products & sellers ---- */
  B.saveEntity = function (kind, rec) {
    requireAdmin();
    rec = rec || {};
    var tbl = kind === 'product' ? 'chem_products' : kind === 'seller' ? 'chem_sellers' : null;
    if (!tbl) throw new Error('Invalid type');
    var row;
    if (kind === 'product') {
      var packs = (Array.isArray(rec.packSizes) ? rec.packSizes : []).map(function (x) { return String(x).trim(); }).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
      row = { product_name: String(rec.productName || '').trim(), unit: String(rec.unit || '').trim(), pack_sizes: packs };
      if (!row.product_name) throw new Error('Product name required');
    } else {
      row = { name: String(rec.name || '').trim() };
      if (!row.name) throw new Error('Seller name required');
    }
    return q(sb().from(tbl).select('*')).then(function (all) {
      var dup = all.some(function (x) {
        if (rec.id && x.id === rec.id) return false;
        return kind === 'product'
          ? (x.product_name.toLowerCase() === row.product_name.toLowerCase() && (x.unit || '').toLowerCase() === row.unit.toLowerCase())
          : x.name.toLowerCase() === row.name.toLowerCase();
      });
      if (dup) throw new Error('Already exists');
      if (rec.id && all.some(function (x) { return x.id === rec.id; })) return q(sb().from(tbl).update(row).eq('id', rec.id));
      row.id = SCS.shortId();
      row.sort_order = all.reduce(function (m, x) { return Math.max(m, x.sort_order || 0); }, 0) + 1;
      return q(sb().from(tbl).insert(row));
    }).then(listsResult);
  };

  B.reorderEntities = function (kind, ids) {
    requireAdmin();
    var tbl = kind === 'product' ? 'chem_products' : 'chem_sellers';
    return q(sb().from(tbl).select('id, sort_order')).then(function (all) {
      var cur = {}; all.forEach(function (x) { cur[x.id] = x.sort_order; });
      var order = (ids || []).filter(function (id) { return cur[id] !== undefined; });
      all.forEach(function (x) { if (order.indexOf(x.id) === -1) order.push(x.id); });
      var chain = Promise.resolve();
      order.forEach(function (id, i) {
        if (cur[id] === i + 1) return;
        chain = chain.then(function () { return q(sb().from(tbl).update({ sort_order: i + 1 }).eq('id', id)); });
      });
      return chain;
    }).then(listsResult);
  };

  B.deleteEntity = function (kind, id) {
    requireAdmin();
    var tbl = kind === 'product' ? 'chem_products' : 'chem_sellers';
    return q(sb().from(tbl).delete().eq('id', id).select('id')).then(function (r) {
      if (!r || !r.length) throw new Error('Not found');
      return listsResult();
    });
  };

  /* ---- admin config ---- */
  B.getAdminConfig = function () {
    requireAdmin();
    return Promise.all([smsConfig(), pdfConfig()]).then(function (r) {
      var sms = r[0], pdf = r[1];
      return {
        sms: { enabled: sms.enabled, apiUrl: sms.apiUrl, apiKeyMasked: sms.apiKeyMasked, apiKeySet: sms.apiKeySet, senderId: sms.senderId, lines: sms.lines },
        sync: { enabled: false, sheetUrl: '', tabName: 'SCS Order', auto: false, lastSync: '', lastError: '' },
        pdf: { folderId: '', sealId: pdf.sealUrl, letterheadId: pdf.letterheadPath },
        backup: { enabled: false, folderId: '', every: '60', keep: 48, lastTime: '', lastStatus: '' },
        smsDefaultLines: SMS_DEFAULT_LINES
      };
    });
  };

  B.saveSmsConfig = function (cfg) {
    requireAdmin();
    cfg = cfg || {};
    return smsConfig().then(function (old) {
      var lines = (Array.isArray(cfg.lines) ? cfg.lines : old.lines).slice(0, 30).map(function (l, i) {
        return { id: String(l.id || ('l' + i)).slice(0, 30), label: String(l.label || '').slice(0, 40), enabled: !!l.enabled, text: String(l.text || '').slice(0, 500) };
      });
      var apiUrl = String(cfg.apiUrl || '').trim();
      if (apiUrl && !/^https?:\/\//i.test(apiUrl)) throw new Error('API URL must start with http:// or https://');
      var newKey = (cfg.apiKey === undefined || cfg.apiKey === null || cfg.apiKey === '__KEEP__') ? '' : String(cfg.apiKey).trim();
      var keySet = old.apiKeySet || !!newKey, masked = newKey ? maskKey(newKey) : old.apiKeyMasked;
      var out = { enabled: !!cfg.enabled, apiUrl: apiUrl, senderId: String(cfg.senderId || '').trim(), lines: lines, apiKeySet: keySet, apiKeyMasked: masked };
      if (out.enabled && (!out.apiUrl || !keySet)) throw new Error('SMS চালু করতে API URL ও API Key দিন।');
      var p = newKey ? q(sb().rpc('chem_set_secret', { p_key: 'sms_api_key', p_value: newKey })) : Promise.resolve();
      return p.then(function () { return setSetting('sms', out); }).then(function () { return { ok: true, apiKeyMasked: masked, apiKeySet: keySet }; });
    });
  };

  B.previewSms = function (cfg) {
    return smsConfig().then(function (c) {
      return renderSmsText({ lines: (cfg && cfg.lines) || c.lines }, {
        client: 'Rahim Traders', orderNo: '202611-07', productLines: ['Waterproof Chemical 20 Litre', 'Tile Adhesive 5 Kg'],
        total: 18500, transport: 500, address: 'Narayanganj Sadar, Dhaka', delivery: '12 Nov 2026 10:30', mobile: '8801711000000', orderBy: 'Office'
      });
    });
  };
  B.sendTestSms = function (to) { requireAdmin(); return SCS.callFn('send-sms', { test: true, to: String(to || '') }).then(function () { return { ok: true }; }); };
  B.retryPendingSms = function () { requireAdmin(); return SCS.callFn('send-sms', { retryPending: true }).then(function (r) { return { sent: (r && r.sent) || 0 }; }); };

  B.saveSyncConfig = function () { return { ok: true }; };
  B.syncAllNow = function () { return { ok: true, added: 0, updated: 0 }; };

  B.savePdfConfig = function (cfg) {
    requireAdmin();
    cfg = cfg || {};
    return pdfConfig().then(function (old) {
      return setSetting('pdf', { sealUrl: String(cfg.sealId || '').trim(), letterheadPath: String(cfg.letterhead !== undefined ? cfg.letterhead : old.letterheadPath || '').trim() });
    }).then(function () { return { ok: true }; });
  };
  B.uploadLetterhead = function (b64, mime, name) {
    requireAdmin();
    var blob = SCS.dataUrlToBlob('data:' + (mime || 'image/png') + ';base64,' + b64);
    var ext = /jpe?g/i.test(mime) ? 'jpg' : 'png';
    var path = APP + '/letterhead/letterhead-' + Date.now() + '.' + ext;
    return SCS.upload(path, blob, mime || 'image/png').then(function () { return pdfConfig(); }).then(function (c) {
      var oldPath = c.letterheadPath;
      return setSetting('pdf', { sealUrl: c.sealUrl, letterheadPath: path }).then(function () {
        if (oldPath && oldPath !== path) SCS.removeFile(oldPath).catch(function () {});
        return { ok: true, id: path };
      });
    });
  };

  B.uploadSeal = function (b64, mime, name) {
    requireAdmin();
    mime = mime || 'image/png';
    var ext = /jpe?g/i.test(mime) ? 'jpg' : /webp/i.test(mime) ? 'webp' : 'png';
    var path = APP + '/seal/seal-' + Date.now() + '.' + ext;
    return SCS.upload(path, SCS.dataUrlToBlob('data:' + mime + ';base64,' + b64), mime).then(function () { return pdfConfig(); }).then(function (c) {
      var old = String(c.sealUrl || '');
      return setSetting('pdf', { sealUrl: 'storage:' + path, letterheadPath: c.letterheadPath }).then(function () {
        if (old.indexOf('storage:') === 0) SCS.removeFile(old.slice(8)).catch(function () {});
        return { ok: true, id: 'storage:' + path };
      });
    });
  };

  /* ---- backup / restore / reset ---- */
  function backupJson(scope, value) {
    var qq = sb().from('chem_orders').select('*').order('order_no');
    if (scope === 'month') qq = qq.like('order_no', String(value) + '-%');
    if (scope === 'year') qq = qq.like('order_no', String(value) + '%');
    return q(qq).then(function (orders) {
      var rows = [];
      orders.forEach(function (o) { rows = rows.concat(orderRows(o)); });
      var out = { app: 'SCS Chemical Order', version: 3, source: 'supabase', created: SCS.fmt(new Date()), scope: scope, value: String(value || ''), headers: HEADERS, orders: rows };
      if (scope !== 'all') return out;
      return Promise.all([loadLists(), smsConfig(), pdfConfig(), B.getHistory(2000)]).then(function (r) {
        out.products = r[0].products; out.sellers = r[0].sellers;
        out.settings = { sms: Object.assign({}, r[1], { apiKeyMasked: '' }), pdf: r[2] };
        out.history = r[3].items;
        return out;
      });
    }).then(function (o) { return JSON.stringify(o); });
  }
  B.getBackup = function (scope, value) { requireAdmin(); return backupJson(scope, value); };

  function dbOrderFromRows(rows) {
    var f = rows[0];
    var tsRaw = String(f[0] || '').trim(), created = null;
    var tm = tsRaw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
    if (tm) created = tm[1] + 'T' + (tm[2].length === 5 ? tm[2] + ':00' : tm[2]) + '+06:00';
    else if (tsRaw && !isNaN(new Date(tsRaw).getTime())) created = new Date(tsRaw).toISOString();
    var dv = parseDelivery(f[2]);
    var delivery = dv.date ? dv.date + (dv.time ? ' ' + dv.time : '') : String(f[2] || '');
    var transport = 0, scsT = 0;
    rows.forEach(function (r) { transport += n(r[14]); scsT += n(r[15]); });
    var o = {
      order_no: String(f[1]).trim(), delivery_at: delivery, client_name: String(f[3] || ''), mobile: normalizeMobile(f[4]) || String(f[4] || '').replace(/\D/g, ''),
      address: String(f[5] || ''), transport_fee: transport, scs_transport_cost: scsT, order_by: String(f[16] || ''),
      commission_holder_name: String(f[19] || ''), sms_status: String(f[21] || 'Pending') || 'Pending', pdf_status: String(f[22] || 'Not Uploaded') || 'Not Uploaded',
      items: rows.filter(function (r) { return String(r[6] || '').trim(); }).map(function (r) {
        return { productName: String(r[6] || ''), quantity: n(r[7]), unit: String(r[8] || ''), packSize: String(r[9] || ''), unitPrice: n(r[10]), discountUnitPrice: n(r[11]), engCom: n(r[17]), conCom: n(r[18]), rowCommission: n(r[20]) };
      })
    };
    if (created) o.created_at = created;
    if (/Uploaded/i.test(o.pdf_status)) o.pdf_status = 'Not Uploaded';   // পুরনো Drive PDF এখানে নেই
    return o;
  }

  B.restoreBackup = function (jsonText, replace) {
    requireAdmin();
    var d;
    try { d = JSON.parse(jsonText); } catch (e) { throw new Error('Invalid JSON file'); }
    if (!d || d.app !== 'SCS Chemical Order' || !Array.isArray(d.orders)) throw new Error('This is not an SCS backup file');
    var pre = replace ? wipe() : Promise.resolve();
    return pre.then(function () {
      var groups = {}, keys = [];
      d.orders.forEach(function (r) {
        var no = String(r[1] || '').trim(); if (!no) return;
        if (!groups[no]) { groups[no] = []; keys.push(no); }
        groups[no].push(r);
      });
      return q(sb().from('chem_orders').select('order_no')).then(function (ex) {
        var have = {}; ex.forEach(function (x) { have[x.order_no] = 1; });
        var add = keys.filter(function (k) { return !have[k]; }).map(function (k) { return dbOrderFromRows(groups[k]); });
        var skipped = keys.length - add.length, chain = Promise.resolve();
        for (var i = 0; i < add.length; i += 300) (function (part) { chain = chain.then(function () { return q(sb().from('chem_orders').insert(part)); }); })(add.slice(i, i + 300));
        return chain.then(function () { return { orders: add.length, skipped: skipped }; });
      });
    }).then(function (res) {
      return Promise.all([q(sb().from('chem_products').select('*')), q(sb().from('chem_sellers').select('*'))]).then(function (r) {
        var haveP = {}, haveS = {}, np = [], ns = [], maxP = 0, maxS = 0;
        r[0].forEach(function (p) { haveP[(p.product_name + '|' + (p.unit || '')).toLowerCase()] = 1; maxP = Math.max(maxP, p.sort_order || 0); });
        r[1].forEach(function (s) { haveS[s.name.toLowerCase()] = 1; maxS = Math.max(maxS, s.sort_order || 0); });
        (d.products || []).forEach(function (p) {
          var k = (String(p.productName) + '|' + String(p.unit || '')).toLowerCase();
          if (!p.productName || haveP[k]) return; haveP[k] = 1;
          np.push({ id: SCS.shortId(), product_name: p.productName, unit: p.unit || '', pack_sizes: p.packSizes || [], sort_order: ++maxP });
        });
        (d.sellers || []).forEach(function (s) {
          if (!s.name || haveS[String(s.name).toLowerCase()]) return; haveS[String(s.name).toLowerCase()] = 1;
          ns.push({ id: SCS.shortId(), name: s.name, sort_order: ++maxS });
        });
        return Promise.all([np.length ? q(sb().from('chem_products').insert(np)) : null, ns.length ? q(sb().from('chem_sellers').insert(ns)) : null]).then(function () {
          var st = replace && d.settings && d.settings.sms ? smsConfig().then(function (cur) {
            var s = d.settings.sms;
            return setSetting('sms', { enabled: cur.apiKeySet ? !!s.enabled : false, apiUrl: s.apiUrl || '', senderId: s.senderId || '', lines: s.lines || SMS_DEFAULT_LINES, apiKeySet: cur.apiKeySet, apiKeyMasked: cur.apiKeyMasked });
          }) : Promise.resolve();
          return st.then(function () { return { ok: true, orders: res.orders, skipped: res.skipped, products: np.length, sellers: ns.length }; });
        });
      });
    });
  };

  function wipe() {
    return q(sb().from('chem_orders').delete().neq('order_no', ''))
      .then(function () { return q(sb().from('chem_products').delete().neq('id', '')); })
      .then(function () { return q(sb().from('chem_sellers').delete().neq('id', '')); });
  }
  B.resetApp = function () { requireAdmin(); return wipe().then(function () { return { ok: true }; }); };

  B.saveBackupConfig = function () { throw new Error('Supabase নিজেই প্রতিদিন ডাটাবেস ব্যাকআপ রাখে। প্রয়োজনে "Download Backup" দিয়ে JSON ব্যাকআপ নিন।'); };
  B.runBackupNow = B.saveBackupConfig;

  window.SCS_BACKEND = B;
})();