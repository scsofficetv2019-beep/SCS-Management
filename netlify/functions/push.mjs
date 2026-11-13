/* =====================================================================
 *  Netlify Function: push   (Web Push — মোবাইল/কম্পিউটারের নোটিফিকেশন বারে)
 *
 *  GET                         -> { publicKey }   (VAPID key প্রথমবার নিজেই তৈরি হয়ে
 *                                                  Supabase sys_secrets এ জমা থাকে)
 *  POST { dispatch: true }     -> জমে থাকা নোটিফিকেশনগুলো সাবস্ক্রাইব করা ডিভাইসে পাঠায়
 *  POST { test: true }         -> নিজের ডিভাইসে একটি টেস্ট নোটিফিকেশন
 *
 *  কোনো npm প্যাকেজ লাগে না — Web Push এনক্রিপশন (RFC 8291) ও VAPID (RFC 8292)
 *  Node-এর নিজস্ব crypto দিয়ে করা।
 * ===================================================================== */
import crypto from 'node:crypto';

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => Buffer.from(String(s), 'base64url');

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

/* ---------------- VAPID keys (একবার তৈরি, ডাটাবেসে জমা) ---------------- */
let vapidCache = null;
async function vapid() {
  if (vapidCache) return vapidCache;
  const [row] = await rest('/rest/v1/sys_secrets?key=eq.vapid&select=value');
  let jwk = row && row.value ? JSON.parse(row.value) : null;
  if (!jwk) {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    jwk = privateKey.export({ format: 'jwk' });
    await rest('/rest/v1/sys_secrets?on_conflict=key', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: { key: 'vapid', value: JSON.stringify(jwk) } });
    const [again] = await rest('/rest/v1/sys_secrets?key=eq.vapid&select=value');   // দুজন একসাথে বানালে যেটা জমা হয়েছে সেটাই
    jwk = JSON.parse(again.value);
  }
  const publicKey = b64u(Buffer.concat([Buffer.from([4]), unb64u(jwk.x), unb64u(jwk.y)]));
  const key = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  vapidCache = { publicKey, key };
  return vapidCache;
}

function vapidAuth(endpoint, v, subject) {
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const sig = crypto.sign('sha256', Buffer.from(header + '.' + payload), { key: v.key, dsaEncoding: 'ieee-p1363' });
  return 'vapid t=' + header + '.' + payload + '.' + b64u(sig) + ', k=' + v.publicKey;
}

/* ---------------- RFC 8291 aes128gcm encryption ---------------- */
function hkdf(salt, ikm, info, len) {
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  return crypto.createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, len);
}
function encrypt(sub, payload) {
  const uaPublic = unb64u(sub.p256dh);
  const authSecret = unb64u(sub.auth);
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = crypto.randomBytes(16);
  const ikm = hkdf(authSecret, shared, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

async function pushOne(sub, data, v, subject) {
  try {
    const r = await fetch(sub.endpoint, {
      method: 'POST',
      headers: { Authorization: vapidAuth(sub.endpoint, v, subject), TTL: '86400', Urgency: 'high', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream' },
      body: encrypt(sub, JSON.stringify(data))
    });
    if (r.status === 404 || r.status === 410) return 'gone';
    return r.ok ? 'ok' : 'fail:' + r.status;
  } catch (e) { return 'fail'; }
}

async function dispatch(subject) {
  const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const list = await rest('/rest/v1/notifications?select=id,user_id,app_key,title,body,url&pushed_at=is.null&created_at=gte.' + encodeURIComponent(since) + '&order=id.asc&limit=200');
  if (!list || !list.length) return { sent: 0, notifications: 0 };
  // আগে "পাঠানো হচ্ছে" দাগ — একই নোটিফিকেশন দুবার যাবে না
  const ids = list.map((n) => n.id);
  const claimed = await rest('/rest/v1/notifications?id=in.(' + ids.join(',') + ')&pushed_at=is.null', { method: 'PATCH', prefer: 'return=representation', body: { pushed_at: new Date().toISOString() } });
  const mine = new Set((claimed || []).map((n) => n.id));
  const todo = list.filter((n) => mine.has(n.id));
  if (!todo.length) return { sent: 0, notifications: 0 };
  const users = [...new Set(todo.map((n) => n.user_id))];
  const subs = await rest('/rest/v1/push_subscriptions?select=*&user_id=in.(' + users.join(',') + ')');
  if (!subs || !subs.length) return { sent: 0, notifications: todo.length };
  const v = await vapid();
  let sent = 0;
  const gone = [];
  await Promise.all(todo.flatMap((n) => subs.filter((s) => s.user_id === n.user_id).map(async (s) => {
    const r = await pushOne(s, { title: n.title, body: n.body, url: n.url || '/', tag: 'scs-' + n.id, app: n.app_key }, v, subject);
    if (r === 'ok') sent++;
    if (r === 'gone') gone.push(s.id);
  })));
  if (gone.length) await rest('/rest/v1/push_subscriptions?id=in.(' + [...new Set(gone)].join(',') + ')', { method: 'DELETE', prefer: 'return=minimal' });
  return { sent, notifications: todo.length };
}

export default async (req) => {
  if (!URL_ || !ANON || !SERVICE) return json(500, { error: 'Netlify environment variables (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) are missing.' });
  try {
    if (req.method === 'GET') {
      const v = await vapid();
      return json(200, { publicKey: v.publicKey });
    }
    if (req.method !== 'POST') return json(405, { error: 'GET or POST only' });
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json(401, { error: 'Login required' });
    const u = await fetch(URL_ + '/auth/v1/user', { headers: { apikey: ANON, Authorization: 'Bearer ' + token } });
    if (!u.ok) return json(401, { error: 'Login required' });
    const user = await u.json();
    let body = {};
    try { body = await req.json(); } catch {}
    const subject = 'https://' + new URL(req.url).host;

    if (body.test) {
      await rest('/rest/v1/notifications', { method: 'POST', prefer: 'return=minimal', body: { user_id: user.id, app_key: 'core', title: 'SCS Management', body: 'Test notification — push notifications are working on this device.', url: '/' } });
    }
    const r = await dispatch(subject);
    return json(200, { ok: true, ...r });
  } catch (e) {
    return json(500, { error: String(e.message || e) });
  }
};
