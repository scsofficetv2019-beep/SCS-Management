/* =====================================================================
 *  Netlify Function: password-reset
 *  মোবাইলে SMS কোড পাঠিয়ে পাসওয়ার্ড রিসেট (ইমেইল রিসেট Supabase নিজেই করে)।
 *
 *  POST { action: 'send',   phone }                    -> ৬ সংখ্যার কোড SMS
 *  POST { action: 'verify', phone, code, password }    -> নতুন পাসওয়ার্ড সেট
 *  POST { action: 'test',   to }  (Super Admin টোকেন)  -> টেস্ট SMS
 *
 *  SMS গেটওয়ে: SCS Management > Admin Console > SMS Gateway
 *  (সেট না থাকলে Chemical Order-এর SMS সেটিং ব্যবহার হয়)
 * ===================================================================== */
import crypto from 'node:crypto';

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CODE_MINUTES = 10;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function rest(path, { token, method = 'GET', body, prefer } = {}) {
  const key = token ? ANON : SERVICE;
  const headers = { apikey: key, Authorization: 'Bearer ' + (token || SERVICE), 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(URL_ + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  if (!r.ok) throw new Error((j && (j.message || j.error_description || j.msg)) || ('Supabase error ' + r.status));
  return j;
}

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
  let cfg = (s && s.value) || {}, apiKey = k ? k.value : '';
  if (!cfg.apiUrl || !apiKey) {
    // ফলব্যাক: Chemical Order-এর SMS সেটিং
    const [cs] = await rest('/rest/v1/chem_settings?key=eq.sms&select=value');
    const [ck] = await rest('/rest/v1/chem_secrets?key=eq.sms_api_key&select=value');
    const c = (cs && cs.value) || {};
    if (c.apiUrl && ck && ck.value) { cfg = { enabled: true, apiUrl: c.apiUrl, senderId: c.senderId }; apiKey = ck.value; }
  }
  return { cfg, apiKey };
}

async function sendSms(cfg, apiKey, to, msg) {
  if (!cfg.apiUrl || !apiKey) return { ok: false, error: 'SMS gateway is not set up (Admin Console > SMS Gateway).' };
  if (cfg.enabled === false) return { ok: false, error: 'SMS gateway is turned off.' };
  try {
    const p = cfg.params || {};
    const form = new URLSearchParams();
    form.set(p.apiKey || 'api_key', apiKey);
    form.set(p.message || 'msg', msg);
    form.set(p.to || 'to', to);
    if (cfg.senderId) form.set(p.senderId || 'sender_id', cfg.senderId);
    const r = await fetch(cfg.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch {}
    const ok = (j && Number(j.error) === 0) || (r.ok && !(j && j.error && Number(j.error) !== 0));
    return ok ? { ok: true } : { ok: false, error: (j && j.msg ? String(j.msg) : text).slice(0, 200) };
  } catch (e) { return { ok: false, error: String(e).slice(0, 200) }; }
}

const hash = (uid, code) => crypto.createHash('sha256').update(uid + ':' + code).digest('hex');

async function findUserByPhone(phone) {
  const last10 = phone.slice(-10);
  const rows = await rest('/rest/v1/profiles?select=id,email,phone,status&phone=ilike.*' + encodeURIComponent(last10) + '*');
  return (rows || []).filter((p) => normalizeBdMobile(p.phone) === phone && p.status !== 'disabled');
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (!URL_ || !ANON || !SERVICE) return json(500, { error: 'Netlify environment variables (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) are missing.' });
  let body = {};
  try { body = await req.json(); } catch {}
  const action = String(body.action || '');

  try {
    if (action === 'test') {
      const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      if (!token) return json(401, { error: 'Login required' });
      const ok = await rest('/rest/v1/rpc/is_super_admin', { token, method: 'POST', body: {} });
      if (ok !== true) return json(403, { error: 'Super Admin only' });
      const to = normalizeBdMobile(body.to);
      if (!to) return json(400, { error: 'Enter a valid Bangladeshi mobile number.' });
      const { cfg, apiKey } = await smsConfig();
      const r = await sendSms(cfg, apiKey, to, 'SCS Management test SMS: your SMS gateway is working.');
      return r.ok ? json(200, { ok: true }) : json(400, { error: r.error || 'SMS could not be sent.' });
    }

    const phone = normalizeBdMobile(body.phone);
    if (!phone) return json(400, { error: 'Enter a valid mobile number (01XXXXXXXXX).' });
    const users = await findUserByPhone(phone);
    if (!users.length) return json(404, { error: 'No account found with this mobile number. Use email instead, or ask the admin to add your mobile number.' });
    if (users.length > 1) return json(409, { error: 'More than one account uses this mobile number. Please reset with your email.' });
    const user = users[0];

    if (action === 'send') {
      const [row] = await rest('/rest/v1/password_reset_codes?select=*&user_id=eq.' + user.id);
      const now = Date.now();
      let sentCount = 1, windowStart = new Date(now).toISOString();
      if (row) {
        if (now - new Date(row.created_at).getTime() < 60 * 1000) return json(429, { error: 'Please wait 1 minute before asking for a new code.' });
        const inWindow = now - new Date(row.window_start).getTime() < 60 * 60 * 1000;
        if (inWindow && row.sent_count >= 5) return json(429, { error: 'Too many codes requested. Try again after 1 hour.' });
        if (inWindow) { sentCount = row.sent_count + 1; windowStart = row.window_start; }
      }
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      const { cfg, apiKey } = await smsConfig();
      const r = await sendSms(cfg, apiKey, phone, `SCS Management password reset code: ${code}\nValid for ${CODE_MINUTES} minutes. Do not share this code.`);
      if (!r.ok) return json(502, { error: 'SMS could not be sent: ' + (r.error || 'unknown error') });
      await rest('/rest/v1/password_reset_codes?on_conflict=user_id', {
        method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
        body: { user_id: user.id, code_hash: hash(user.id, code), expires_at: new Date(now + CODE_MINUTES * 60 * 1000).toISOString(), attempts: 0, sent_count: sentCount, window_start: windowStart, created_at: new Date(now).toISOString() }
      });
      return json(200, { ok: true, to: '+' + phone.slice(0, 5) + '•••••' + phone.slice(-3) });
    }

    if (action === 'verify') {
      const code = String(body.code || '').replace(/\D/g, '');
      const password = String(body.password || '');
      if (password.length < 8) return json(400, { error: 'Password must be at least 8 characters.' });
      const [row] = await rest('/rest/v1/password_reset_codes?select=*&user_id=eq.' + user.id);
      if (!row || new Date(row.expires_at).getTime() < Date.now() || row.attempts >= 5) {
        if (row) await rest('/rest/v1/password_reset_codes?user_id=eq.' + user.id, { method: 'DELETE', prefer: 'return=minimal' });
        return json(400, { error: 'The code has expired. Ask for a new code.' });
      }
      const a = Buffer.from(hash(user.id, code)), b = Buffer.from(row.code_hash);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        await rest('/rest/v1/password_reset_codes?user_id=eq.' + user.id, { method: 'PATCH', prefer: 'return=minimal', body: { attempts: row.attempts + 1 } });
        return json(400, { error: 'Wrong code. ' + Math.max(0, 4 - row.attempts) + ' attempt(s) left.' });
      }
      const r = await fetch(URL_ + '/auth/v1/admin/users/' + user.id, {
        method: 'PUT', headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (!r.ok) { const t = await r.text(); return json(400, { error: 'Password could not be changed: ' + t.slice(0, 200) }); }
      await rest('/rest/v1/password_reset_codes?user_id=eq.' + user.id, { method: 'DELETE', prefer: 'return=minimal' });
      return json(200, { ok: true, email: user.email });
    }

    return json(400, { error: 'Unknown action' });
  } catch (e) {
    return json(500, { error: String(e.message || e) });
  }
};
