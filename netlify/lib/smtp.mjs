/* =====================================================================
 *  ছোট SMTP ক্লায়েন্ট (কোনো npm প্যাকেজ লাগে না) — Gmail / Zoho / Brevo সবই চলে
 *  port 465 = SSL, port 587 = STARTTLS
 * ===================================================================== */
import net from 'node:net';
import tls from 'node:tls';

const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
const encWord = (s) => '=?UTF-8?B?' + b64(s) + '?=';

function reader(sock) {
  let buf = '';
  let waiters = [];
  const onData = (d) => { buf += d.toString('utf8'); pump(); };
  const onErr = (e) => { waiters.forEach((w) => w.rej(e)); waiters = []; };
  sock.on('data', onData);
  sock.on('error', onErr);
  function pump() {
    while (waiters.length) {
      const m = buf.match(/(^|\r\n)(\d{3}) [^\r\n]*\r\n/);
      if (!m) return;
      const end = m.index + m[0].length;
      const text = buf.slice(0, end);
      buf = buf.slice(end);
      waiters.shift().res({ code: Number(m[2]), text: text.trim() });
    }
  }
  return {
    next: () => new Promise((res, rej) => { waiters.push({ res, rej }); pump(); }),
    detach: () => { sock.off('data', onData); sock.off('error', onErr); }
  };
}

/**
 * sendMail({ host, port, user, pass, fromName, to, subject, html, text })
 */
export async function sendMail(o) {
  const host = String(o.host || '').trim();
  const port = Number(o.port) || 465;
  if (!host || !o.user || !o.pass) throw new Error('Email (SMTP) is not set up.');
  const secure = port === 465;
  let sock = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
  const timer = setTimeout(() => sock.destroy(new Error('SMTP timeout')), 25000);
  let rd = reader(sock);
  async function cmd(line, ok) {
    if (line !== null) sock.write(line + '\r\n');
    const r = await rd.next();
    const okList = Array.isArray(ok) ? ok : [ok];
    if (!okList.includes(r.code)) {
      const shown = /^AUTH|^[A-Za-z0-9+/=]{8,}$/.test(line || '') ? '(login)' : (line || 'connect');
      throw new Error('SMTP ' + shown + ' → ' + r.text.slice(0, 200));
    }
    return r;
  }
  try {
    await cmd(null, 220);
    await cmd('EHLO scs-management', 250);
    if (!secure) {
      await cmd('STARTTLS', 220);
      rd.detach();
      sock = tls.connect({ socket: sock, servername: host });
      rd = reader(sock);
      await new Promise((res, rej) => { sock.once('secureConnect', res); sock.once('error', rej); });
      await cmd('EHLO scs-management', 250);
    }
    await cmd('AUTH LOGIN', 334);
    await cmd(b64(o.user), 334);
    await cmd(b64(o.pass), 235);
    const from = String(o.user).trim();
    await cmd('MAIL FROM:<' + from + '>', 250);
    await cmd('RCPT TO:<' + String(o.to).trim() + '>', [250, 251]);
    await cmd('DATA', 354);
    const body = b64(o.html || o.text || '').replace(/.{1,76}/g, '$&\r\n');
    const msg = [
      'From: ' + encWord(o.fromName || 'SCS Management') + ' <' + from + '>',
      'To: <' + String(o.to).trim() + '>',
      'Subject: ' + encWord(o.subject || 'SCS Management'),
      'Date: ' + new Date().toUTCString(),
      'Message-ID: <' + Date.now() + '.' + Math.random().toString(16).slice(2) + '@scs-management>',
      'MIME-Version: 1.0',
      'Content-Type: ' + (o.html ? 'text/html' : 'text/plain') + '; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      body
    ].join('\r\n');
    await cmd(msg + '\r\n.', 250);
    try { sock.write('QUIT\r\n'); } catch {}
    return { ok: true };
  } finally {
    clearTimeout(timer);
    setTimeout(() => { try { sock.destroy(); } catch {} }, 200);
  }
}
