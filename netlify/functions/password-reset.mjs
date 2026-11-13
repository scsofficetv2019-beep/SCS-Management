/* =====================================================================
 *  Netlify Function: password-reset   (মোবাইল SMS কোড দিয়ে অ্যাকাউন্ট খোলা, লগইন ও পাসওয়ার্ড রিসেট)
 *
 *  POST { action: 'health' }                                  -> সার্ভার/কী/SMS সেটআপ ঠিক আছে কি না (Super Admin)
 *  POST { action: 'test', to }                                 -> টেস্ট SMS (Super Admin)
 *  POST { action: 'send', purpose: 'signup'|'login'|'reset', phone, email? }  -> ৬ সংখ্যার কোড SMS
 *  POST { action: 'signup', phone, code, email, password, full_name }        -> অ্যাকাউন্ট তৈরি (ইমেইল লাগে না)
 *  POST { action: 'login', phone, code }                       -> { token_hash } (ব্রাউজার verifyOtp করে লগইন)
 *  POST { action: 'loginPassword', phone, password }          -> { session } (মোবাইল নম্বর + পাসওয়ার্ড)
 *  POST { action: 'verify', phone, code, password }           -> নতুন পাসওয়ার্ড সেট
 *
 *  SMS গেটওয়ে: Admin Console > SMS gateway (না থাকলে Chemical Order এর SMS সেটিং)
 *  Netlify env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *  (পুরনো eyJ... JWT key বা নতুন sb_publishable_ / sb_secret_ key দুটোই চলে)
 * ===================================================================== */
import crypto from 'node:crypto';

const URL_ = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const ANON = (process.env.SUPABASE_ANON_KEY || '').trim();
const SERVICE = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const CODE_MINUTES = 10;
const PURPOSES = ['signup', 'login', 'reset'];

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const isJwt = (k) => /^eyJ/.test(k);

function keyHelp(msg) {
  if (/unregistered api key|invalid api key|no api key|jwt|invalid.*signature/i.test(msg)) {
    return 'Supabase key ভুল (' + msg + ')। Netlify > Project configuration > Environment variables এ SUPABASE_URL, SUPABASE_ANON_KEY ও SUPABASE_SERVICE_ROLE_KEY একই Supabase প্রজেক্টের কি না দেখুন (Supabase > Project Settings > API Keys থেকে আবার কপি করুন, আগে-পিছে ফাঁকা জায়গা ছাড়া), তারপর Deploys > Trigger deploy দিন।';
  }
  return msg;
}

/** Supabase REST/Auth কল। token থাকলে ইউজার হিসেবে, না থাকলে service role হিসেবে */
async function sbFetch(path, { token, method = 'GET', body, prefer, anon } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) { headers.apikey = ANON; headers.Authorization = 'Bearer ' + token; }
  else if (anon) { headers.apikey = ANON; if (isJwt(ANON)) headers.Authorization = 'Bearer ' + ANON; }
  else { headers.apikey = SERVICE; if (isJwt(SERVICE)) headers.Authorization = 'Bearer ' + SERVICE; }
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(URL_ + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  if (!r.ok) {
    const m = (j && (j.message || j.msg || j.error_description || j.error)) || ('Supabase error ' + r.status);
    const e = new Error(keyHelp(String(m))); e.status = r.status; e.body = j; throw e;
  }
  return j;
}
const rest = sbFetch;

export function normalizeBdMobile(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (/^8801[3-9]\d{8}$/.test(d)) return d;
  if (/^01[3-9]\d{8}$/.test(d)) return '88' + d;
  if (/^1[3-9]\d{8}$/.test(d)) return '880' + d;
  return null;
}

async function smsConfig() {
  const [s] = await rest('/rest/v1/sys_settings?key=eq.sms&select=value');
  const [k] = await rest('/rest/v1/sys_secrets?key=eq.sms_api_key&select=value');
  let cfg = (s && s.value) || {}, apiKey = k ? k.value : '', source = 'admin-console';
  if (!cfg.apiUrl || !apiKey) {
    const [cs] = await rest('/rest/v1/chem_settings?key=eq.sms&select=value');
    const [ck] = await rest('/rest/v1/chem_secrets?key=eq.sms_api_key&select=value');
    const c = (cs && cs.value) || {};
    if (c.apiUrl && ck && ck.value) { cfg = { enabled: true, apiUrl: c.apiUrl, senderId: c.senderId }; apiKey = ck.value; source = 'chemical-order'; }
  }
  return { cfg, apiKey, source };
}

async function sendSms(cfg, apiKey, to, msg) {
  if (!cfg.apiUrl || !apiKey) return { ok: false, code: 'sms_not_configured', error: 'SMS gateway is not set up yet (Admin Console > SMS gateway).' };
  if (cfg.enabled === false) return { ok: false, code: 'sms_not_configured', error: 'SMS gateway is turned off (Admin Console > SMS gateway).' };
  try {
    const p = cfg.params || {};
    const form = new URLSearchParams();
    form.set(p.apiKey || 'api_key', apiKey);
    form.set(p.message || 'msg', msg);
    form.set(p.to || 'to', to);
    if (cfg.senderId) form.set(p.senderId || 'sender_id', cfg.senderId);
    const method = String(cfg.method || 'POST').toUpperCase();
    const r = method === 'GET'
      ? await fetch(cfg.apiUrl + (cfg.apiUrl.includes('?') ? '&' : '?') + form.toString())
      : await fetch(cfg.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch {}
    const code = j ? (j.response_code ?? j.error ?? j.status_code ?? j.code) : undefined;
    const ok = r.ok && (code === undefined || Number(code) === 0 || Number(code) === 202 || Number(code) === 200 || /success|sent|ok/i.test(String(j && (j.success_message || j.status || j.message || ''))));
    return ok ? { ok: true, raw: text.slice(0, 200) } : { ok: false, error: 'SMS provider: ' + (j ? (j.error_message || j.msg || j.message || text) : text).toString().slice(0, 200) };
  } catch (e) { return { ok: false, error: 'SMS provider unreachable: ' + String(e).slice(0, 200) }; }
}

const hash = (phone, purpose, code) => crypto.createHash('sha256').update(phone + ':' + purpose + ':' + code + ':' + SERVICE.slice(-12)).digest('hex');

async function usersByPhone(phone) {
  const last10 = phone.slice(-10);
  const rows = await rest('/rest/v1/profiles?select=id,email,phone,status&phone=ilike.*' + encodeURIComponent(last10) + '*');
  return (rows || []).filter((p) => normalizeBdMobile(p.phone) === phone);
}

async function issueCode(phone, purpose, smsText) {
  const [row] = await rest('/rest/v1/sms_codes?select=*&phone=eq.' + phone + '&purpose=eq.' + purpose);
  const now = Date.now();
  let sentCount = 1, windowStart = new Date(now).toISOString();
  if (row) {
    if (now - new Date(row.created_at).getTime() < 60 * 1000) return json(429, { error: 'Please wait 1 minute before asking for a new code. / ১ মিনিট পর আবার চেষ্টা করুন।' });
    const inWindow = now - new Date(row.window_start).getTime() < 60 * 60 * 1000;
    if (inWindow && row.sent_count >= 5) return json(429, { error: 'Too many codes. Try again after 1 hour. / অনেকবার কোড চাওয়া হয়েছে, ১ ঘণ্টা পর চেষ্টা করুন।' });
    if (inWindow) { sentCount = row.sent_count + 1; windowStart = row.window_start; }
  }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const { cfg, apiKey } = await smsConfig();
  const r = await sendSms(cfg, apiKey, phone, smsText(code));
  if (!r.ok) return json(r.code === 'sms_not_configured' ? 503 : 502, { error: r.error, code: r.code || 'sms_failed' });
  await rest('/rest/v1/sms_codes?on_conflict=phone,purpose', {
    method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    body: { phone, purpose, code_hash: hash(phone, purpose, code), expires_at: new Date(now + CODE_MINUTES * 60 * 1000).toISOString(), attempts: 0, sent_count: sentCount, window_start: windowStart, created_at: new Date(now).toISOString() }
  });
  return json(200, { ok: true, to: '+' + phone.slice(0, 5) + '•••••' + phone.slice(-3) });
}

/** কোড যাচাই; ঠিক হলে null, না হলে Response */
async function checkCode(phone, purpose, code) {
  code = String(code || '').replace(/\D/g, '');
  const [row] = await rest('/rest/v1/sms_codes?select=*&phone=eq.' + phone + '&purpose=eq.' + purpose);
  if (!row || new Date(row.expires_at).getTime() < Date.now() || row.attempts >= 5) {
    if (row) await rest('/rest/v1/sms_codes?phone=eq.' + phone + '&purpose=eq.' + purpose, { method: 'DELETE', prefer: 'return=minimal' });
    return json(400, { error: 'The code has expired. Ask for a new code. / কোডের মেয়াদ শেষ, নতুন কোড নিন।' });
  }
  const a = Buffer.from(hash(phone, purpose, code)), b = Buffer.from(row.code_hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    await rest('/rest/v1/sms_codes?phone=eq.' + phone + '&purpose=eq.' + purpose, { method: 'PATCH', prefer: 'return=minimal', body: { attempts: row.attempts + 1 } });
    return json(400, { error: 'Wrong code. ' + Math.max(0, 4 - row.attempts) + ' attempt(s) left. / ভুল কোড।' });
  }
  await rest('/rest/v1/sms_codes?phone=eq.' + phone + '&purpose=eq.' + purpose, { method: 'DELETE', prefer: 'return=minimal' });
  return null;
}

async function requireSuper(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Login required' });
  const ok = await rest('/rest/v1/rpc/is_super_admin', { token, method: 'POST', body: {} });
  return ok === true ? null : json(403, { error: 'Super Admin only' });
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (!URL_ || !ANON || !SERVICE) return json(500, { error: 'Netlify environment variables (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) are missing. Add them and Trigger deploy.' });
  let body = {};
  try { body = await req.json(); } catch {}
  const action = String(body.action || '');

  try {
    /* ---------- admin tools ---------- */
    if (action === 'health') {
      let who = 'unknown';
      try { const deny = await requireSuper(req); if (deny) return deny; who = 'super admin'; }
      catch (e) { /* key ভুল হলে এখানেই ধরা পড়ে — নিচে বিস্তারিত দেখাই */ who = 'check failed: ' + e.message; }
      const out = { who, env: { SUPABASE_URL: !!URL_, SUPABASE_ANON_KEY: !!ANON, SUPABASE_SERVICE_ROLE_KEY: !!SERVICE }, keyType: { anon: isJwt(ANON) ? 'legacy JWT' : ANON.slice(0, 15) + '…', service: isJwt(SERVICE) ? 'legacy JWT' : SERVICE.slice(0, 10) + '…' } };
      try { await rest('/rest/v1/apps?select=key&limit=1'); out.serviceKey = 'OK'; } catch (e) { out.serviceKey = e.message; }
      try { await rest('/rest/v1/apps?select=key&limit=1', { anon: true }); out.anonKey = 'OK'; } catch (e) { out.anonKey = e.message; }
      try { const s = await smsConfig(); out.sms = s.cfg.apiUrl && s.apiKey ? 'configured (' + s.source + ')' : 'not configured'; } catch (e) { out.sms = e.message; }
      return json(200, out);
    }
    if (action === 'test') {
      const deny = await requireSuper(req); if (deny) return deny;
      const to = normalizeBdMobile(body.to);
      if (!to) return json(400, { error: 'Enter a valid Bangladeshi mobile number.' });
      const { cfg, apiKey } = await smsConfig();
      const r = await sendSms(cfg, apiKey, to, 'SCS Management test SMS: your SMS gateway is working.');
      return r.ok ? json(200, { ok: true, raw: r.raw }) : json(400, { error: r.error || 'SMS could not be sent.' });
    }

    /* ---------- code flows ---------- */
    const phone = normalizeBdMobile(body.phone);
    if (!phone) return json(400, { error: 'Enter a valid mobile number (01XXXXXXXXX). / সঠিক মোবাইল নম্বর দিন।' });

    if (action === 'send') {
      const purpose = PURPOSES.includes(body.purpose) ? body.purpose : 'reset';
      const users = await usersByPhone(phone);
      if (purpose === 'signup') {
        if (users.length) return json(409, { error: 'An account already uses this mobile number — log in instead. / এই নম্বরে আগেই অ্যাকাউন্ট আছে, লগইন করুন।' });
        return issueCode(phone, purpose, (c) => `SCS Management: your sign-up code is ${c}\nValid for ${CODE_MINUTES} minutes.`);
      }
      if (!users.length) return json(404, { error: 'No account found with this mobile number. / এই নম্বরে কোনো অ্যাকাউন্ট নেই।' });
      if (users.length > 1) return json(409, { error: 'More than one account uses this number — use email. / এই নম্বরে একাধিক অ্যাকাউন্ট, ইমেইল ব্যবহার করুন।' });
      if (users[0].status === 'disabled') return json(403, { error: 'This account is disabled. / অ্যাকাউন্টটি বন্ধ।' });
      return issueCode(phone, purpose, (c) => `SCS Management ${purpose === 'login' ? 'login' : 'password reset'} code: ${c}\nValid for ${CODE_MINUTES} minutes. Do not share.`);
    }

    if (action === 'signup') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const fullName = String(body.full_name || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: 'Enter a valid email. / সঠিক ইমেইল দিন।' });
      if (password.length < 8) return json(400, { error: 'Password must be at least 8 characters.' });
      if (!fullName) return json(400, { error: 'Enter your full name.' });
      if ((await usersByPhone(phone)).length) return json(409, { error: 'An account already uses this mobile number.' });
      const bad = await checkCode(phone, 'signup', body.code); if (bad) return bad;
      try {
        await sbFetch('/auth/v1/admin/users', { method: 'POST', body: { email, password, email_confirm: true, user_metadata: { full_name: fullName, phone: '0' + phone.slice(3) } } });
      } catch (e) {
        if (/already|registered|exists/i.test(e.message)) return json(409, { error: 'An account with this email already exists — log in. / এই ইমেইলে আগেই অ্যাকাউন্ট আছে।' });
        throw e;
      }
      return json(200, { ok: true, email });
    }

    if (action === 'login') {
      const users = await usersByPhone(phone);
      if (users.length !== 1) return json(404, { error: 'No single account found with this mobile number.' });
      const bad = await checkCode(phone, 'login', body.code); if (bad) return bad;
      const link = await sbFetch('/auth/v1/admin/generate_link', { method: 'POST', body: { type: 'magiclink', email: users[0].email } });
      const th = (link && (link.hashed_token || (link.properties && link.properties.hashed_token))) || '';
      if (!th) return json(500, { error: 'Could not create a login session.' });
      return json(200, { ok: true, token_hash: th, email: users[0].email });
    }

    if (action === 'loginPassword') {
      const users = await usersByPhone(phone);
      if (users.length !== 1) return json(400, { error: 'Wrong mobile number or password. / মোবাইল নম্বর বা পাসওয়ার্ড ভুল।' });
      const r = await fetch(URL_ + '/auth/v1/token?grant_type=password', {
        method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: users[0].email, password: String(body.password || '') })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return json(400, { error: /invalid/i.test(JSON.stringify(j)) ? 'Wrong mobile number or password. / মোবাইল নম্বর বা পাসওয়ার্ড ভুল।' : keyHelp(j.msg || j.error_description || j.message || 'Login failed') });
      return json(200, { ok: true, session: { access_token: j.access_token, refresh_token: j.refresh_token } });
    }

    if (action === 'verify') {
      const password = String(body.password || '');
      if (password.length < 8) return json(400, { error: 'Password must be at least 8 characters.' });
      const users = await usersByPhone(phone);
      if (users.length !== 1) return json(404, { error: 'No single account found with this mobile number.' });
      const bad = await checkCode(phone, 'reset', body.code); if (bad) return bad;
      await sbFetch('/auth/v1/admin/users/' + users[0].id, { method: 'PUT', body: { password } });
      return json(200, { ok: true, email: users[0].email });
    }

    return json(400, { error: 'Unknown action' });
  } catch (e) {
    return json(500, { error: keyHelp(String(e.message || e)) });
  }
};
