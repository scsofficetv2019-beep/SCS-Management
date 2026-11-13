/* =====================================================================
 *  Netlify Function: send-sms
 *  SCS Chemical Order থেকে কাস্টমারকে SMS পাঠায়।
 *  - SMS API key ব্রাউজারে কখনো যায় না; এটি Supabase-এর chem_secrets টেবিলে থাকে
 *    এবং শুধু এই সার্ভার ফাংশন (service role key দিয়ে) পড়তে পারে।
 *  - কলকারী লগইন করা ও Chemical Order অ্যাক্সেস থাকা ইউজার কি না যাচাই করা হয়।
 *  - SMS স্ট্যাটাস আপডেট ইউজারের নিজের টোকেন দিয়ে হয়, তাই Activity Log-এ তার নাম থাকে।
 *
 *  Netlify > Site configuration > Environment variables:
 *    SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 * ===================================================================== */
const URL_ = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const ANON = (process.env.SUPABASE_ANON_KEY || '').trim();
const SERVICE = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const isJwt = (k) => /^eyJ/.test(k);
function keyHelp(msg) {
  return /unregistered api key|invalid api key|no api key/i.test(msg)
    ? 'Supabase key ভুল (' + msg + ')। Netlify Environment variables এ SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY একই প্রজেক্টের কি না দেখে আবার বসান, তারপর Trigger deploy দিন।'
    : msg;
}
const APP = 'chemical-order';

const SMS_DEFAULT_LINES = [
  { id: 'intro', enabled: true, text: 'Thank you for purchasing products from Swarup Construction Solution.' },
  { id: 'dear', enabled: true, text: 'Dear {client},' },
  { id: 'received', enabled: true, text: 'We have received your order now (Order No: {orderNo}).' },
  { id: 'products', enabled: true, text: 'Your Product:\n{products}' },
  { id: 'price', enabled: true, text: '{price}' },
  { id: 'address', enabled: true, text: 'Delivery Address: {address}.' },
  { id: 'hotline', enabled: true, text: 'Hotline: +8801711190271' },
  { id: 'website', enabled: true, text: 'Website: swarupconstructionsolution.com' }
];

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function rest(path, { token, method = 'GET', body, prefer } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) { headers.apikey = ANON; headers.Authorization = 'Bearer ' + token; }
  else { headers.apikey = SERVICE; if (isJwt(SERVICE)) headers.Authorization = 'Bearer ' + SERVICE; }
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(URL_ + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  if (!r.ok) throw new Error(keyHelp(String((j && (j.message || j.error_description || j.msg)) || ('Supabase error ' + r.status))));
  return j;
}

function normalizeBdMobile(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (/^8801[3-9]\d{8}$/.test(d)) return d;
  if (/^01[3-9]\d{8}$/.test(d)) return '88' + d;
  if (/^1[3-9]\d{8}$/.test(d)) return '880' + d;
  return null;
}
const taka = (v) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }).replace(/\.00$/, '');
function fmtDelivery(s) {
  const m = String(s || '').match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}:\d{2}))?/);
  if (!m) return String(s || '');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return Number(m[3]) + ' ' + MON[Number(m[2]) - 1] + ' ' + m[1] + (m[4] && m[4] !== '00:00' ? ' ' + m[4] : '');
}
function renderSms(lines, d) {
  const total = taka(d.total), transport = taka(d.transport);
  const price = d.transport > 0 ? `Total Price: ${total} Taka with ${transport} taka Transport Fee.` : `Total Price: ${total} Taka.`;
  const map = { client: d.client || 'Customer', orderNo: d.orderNo || '', products: d.productLines.length ? d.productLines.join('\n') : '-', price, total, transport, address: d.address || '-', delivery: d.delivery || '-', mobile: d.mobile || '', orderBy: d.orderBy || '-' };
  return (lines || []).filter((l) => l.enabled).map((l) => String(l.text || '').replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m))).filter((s) => s.trim() !== '').join('\n');
}
async function sendSms(cfg, apiKey, to, msg) {
  if (!cfg.apiUrl || !apiKey) return { ok: false, error: 'SMS API সেট করা নেই (Admin > SMS Setup)।' };
  try {
    const r = await fetch(cfg.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ api_key: apiKey, msg, to, sender_id: cfg.senderId || '' }) });
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch {}
    const rc = j ? (j.response_code ?? j.error ?? j.status_code) : undefined;
    const ok = r.ok && (rc === undefined || [0, 200, 202].includes(Number(rc)));
    if (ok) return { ok: true };
    const raw = j ? String(j.error_message || j.msg || j.message || text) : text;
    return { ok: false, invalidNumber: /invalid|number|mobile|recipient|msisdn/i.test(raw), error: raw.slice(0, 200) };
  } catch (e) { return { ok: false, error: String(e).slice(0, 200) }; }
}
function orderText(cfg, o, mobile) {
  const items = o.items || [];
  const lines = items.filter((i) => i.productName).map((i) => [i.productName, String(i.quantity ?? ''), i.unit || ''].filter(Boolean).join(' '));
  const total = items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.discountUnitPrice || 0), 0);
  const transport = Number(o.transport_fee || 0);
  return renderSms(cfg.lines && cfg.lines.length ? cfg.lines : SMS_DEFAULT_LINES, { client: o.client_name, orderNo: o.order_no, productLines: lines, total: total + transport, transport, address: o.address, delivery: fmtDelivery(o.delivery_at), mobile, orderBy: o.order_by });
}

async function smsForOrder(o, cfg, apiKey, token) {
  let status;
  if (String(o.sms_status || '').includes('Sent')) return o.sms_status;
  if (!cfg.enabled) status = 'SMS Off';
  else {
    const mobile = normalizeBdMobile(o.mobile);
    if (!mobile) status = 'Invalid Number';
    else {
      const r = await sendSms(cfg, apiKey, mobile, orderText(cfg, o, mobile));
      status = r.ok ? 'Sent ✅' : r.invalidNumber ? 'Invalid Number' : 'Not Sent';
    }
  }
  // ইউজারের টোকেন দিয়ে আপডেট -> Activity Log-এ ইউজারের নাম
  await rest('/rest/v1/chem_orders?order_no=eq.' + encodeURIComponent(o.order_no), { token, method: 'PATCH', body: { sms_status: status }, prefer: 'return=minimal' });
  return status;
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (!URL_ || !ANON || !SERVICE) return json(500, { error: 'Netlify environment variables (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) সেট করা নেই।' });
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Login required' });
  let body = {};
  try { body = await req.json(); } catch {}

  try {
    const admin = !!(body.test || body.retryPending);
    const ok = await rest('/rest/v1/rpc/has_app', { token, method: 'POST', body: { p_app: APP, p_role: admin ? 'admin' : 'user' } });
    if (ok !== true) return json(403, { error: admin ? 'Chemical Order Admin access required' : 'Chemical Order access required' });

    const [setRow] = await rest('/rest/v1/chem_settings?key=eq.sms&select=value');
    const [keyRow] = await rest('/rest/v1/chem_secrets?key=eq.sms_api_key&select=value');
    const cfg = (setRow && setRow.value) || {};
    const apiKey = keyRow ? keyRow.value : '';

    if (body.test) {
      const to = normalizeBdMobile(body.to);
      if (!to) return json(400, { error: 'সঠিক মোবাইল নম্বর দিন।' });
      const r = await sendSms(cfg, apiKey, to, 'SCS test SMS: your SMS service is working.');
      return r.ok ? json(200, { ok: true }) : json(400, { error: r.error || 'SMS পাঠানো যায়নি।' });
    }

    if (body.retryPending) {
      if (!cfg.enabled) return json(400, { error: 'SMS Service বন্ধ আছে।' });
      const orders = await rest('/rest/v1/chem_orders?select=*&or=(sms_status.eq.Pending,sms_status.eq.Not%20Sent,sms_status.eq.)&order=order_no.asc&limit=40');
      let sent = 0;
      for (const o of orders) { const s = await smsForOrder(o, cfg, apiKey, token); if (s.includes('Sent')) sent++; }
      return json(200, { ok: true, sent, checked: orders.length });
    }

    const orderNo = String(body.orderNo || '').trim();
    if (!orderNo) return json(400, { error: 'orderNo required' });
    const [o] = await rest('/rest/v1/chem_orders?select=*&order_no=eq.' + encodeURIComponent(orderNo));
    if (!o) return json(404, { error: 'Order not found' });
    const status = await smsForOrder(o, cfg, apiKey, token);
    return json(200, { ok: true, status });
  } catch (e) {
    return json(500, { error: String(e.message || e) });
  }
};
