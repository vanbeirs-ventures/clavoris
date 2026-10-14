// Minimal SMTP submission for Clavoris mail (mailbox.org), replacing the denomailer library.
// The message is built like a standard mail client builds it — the same shape as the mails that are
// delivered fine from the Clavoris mailbox:
//   - Message-ID on the clavoris.com domain and an RFC 5322 Date (with weekday and +0000 zone),
//   - one multipart/alternative body (plain text + HTML, both base64) with a random quoted boundary,
//   - plain address headers (no empty display names, no "multipart/mixed" wrapper without attachments),
//   - EHLO with our own domain (denomailer greeted the server with the server's own host name).
// The server's final reply ("250 … queued as …") is returned so it can be logged and traced.

export type SmtpConfig = { host: string; port: number; user: string; pass: string; helo?: string };
export type OutMail = { fromName: string; from: string; to: string; replyTo?: string; subject: string; text: string; html?: string };

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(s: string): string {
  const bytes = enc.encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const fold76 = (s: string) => (s.match(/.{1,76}/g) || []).join("\r\n");

// Subject: ASCII as is; otherwise RFC 2047 base64 words of at most ~45 bytes, folded one per line.
export function subjectHeader(s: string): string {
  const str = String(s || "").replace(/[\r\n]+/g, " ").trim();
  if (/^[\x20-\x7e]*$/.test(str)) return str;
  const bytes = enc.encode(str);
  const words: string[] = [];
  for (let i = 0; i < bytes.length;) {
    let end = Math.min(bytes.length, i + 45);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--; // never split a UTF-8 sequence
    words.push("=?UTF-8?B?" + btoa(String.fromCharCode(...bytes.subarray(i, end))) + "?=");
    i = end;
  }
  return words.join("\r\n ");
}
// Display name: quoted when it has specials, encoded when it is not ASCII.
function displayName(n: string): string {
  if (!/^[\x20-\x7e]*$/.test(n)) return "=?UTF-8?B?" + b64(n) + "?=";
  return /[()<>\[\]:;@\\,."]/.test(n) ? `"${n.replace(/["\\]/g, "\\$&")}"` : n;
}
function rfc5322Date(d = new Date()): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p = (n: number) => String(n).padStart(2, "0");
  return `${days[d.getUTCDay()]}, ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`;
}

export function buildMessage(m: OutMail): { raw: string; messageId: string } {
  const domain = m.from.split("@")[1] || "clavoris.com";
  const messageId = `<${crypto.randomUUID()}@${domain}>`;
  const boundary = "=_clv_" + crypto.randomUUID().replace(/-/g, "");
  const h = [
    `From: ${displayName(m.fromName)} <${m.from}>`,
    `To: ${m.to}`,
    ...(m.replyTo ? [`Reply-To: ${m.replyTo}`] : []),
    `Subject: ${subjectHeader(m.subject)}`,
    `Date: ${rfc5322Date()}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
  ];
  const part = (type: string, body: string) => [`Content-Type: ${type}; charset="UTF-8"`, "Content-Transfer-Encoding: base64", "", fold76(b64(body.replace(/\r?\n/g, "\r\n")))].join("\r\n");
  let body: string;
  if (m.html) {
    h.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body = ["", `--${boundary}`, part("text/plain", m.text), `--${boundary}`, part("text/html", m.html), `--${boundary}--`, ""].join("\r\n");
  } else {
    h.push(`Content-Type: text/plain; charset="UTF-8"`, "Content-Transfer-Encoding: base64");
    body = ["", fold76(b64(m.text.replace(/\r?\n/g, "\r\n"))), ""].join("\r\n");
  }
  return { raw: h.join("\r\n") + "\r\n" + body, messageId };
}

// One SMTP conversation. Implicit TLS on 465; STARTTLS on any other port.
export async function smtpSend(cfg: SmtpConfig, m: OutMail): Promise<{ messageId: string; reply: string }> {
  const { raw, messageId } = buildMessage(m);
  let conn: Deno.Conn = cfg.port === 465
    ? await Deno.connectTls({ hostname: cfg.host, port: cfg.port })
    : await Deno.connect({ hostname: cfg.host, port: cfg.port });
  const timer = setTimeout(() => { try { conn.close(); } catch { /* closed */ } }, 30_000);
  let buf = "";
  const read = async (): Promise<{ code: number; text: string }> => {
    const chunk = new Uint8Array(4096);
    for (;;) {
      // A reply is complete at a line "NNN text" (a dash after the code means more lines follow).
      const lines = buf.split("\r\n");
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3} /.test(lines[i]) || /^\d{3}$/.test(lines[i])) {
          const text = lines.slice(0, i + 1).join("\n");
          buf = lines.slice(i + 1).join("\r\n");
          return { code: Number(lines[i].slice(0, 3)), text };
        }
      }
      const n = await conn.read(chunk);
      if (n === null) throw new Error("SMTP connection closed: " + buf.slice(0, 200));
      buf += dec.decode(chunk.subarray(0, n));
    }
  };
  const write = async (s: string) => { const b = enc.encode(s); let o = 0; while (o < b.length) o += await conn.write(b.subarray(o)); };
  const cmd = async (line: string, want: number[], label = line.split(" ")[0]) => {
    await write(line + "\r\n");
    const r = await read();
    if (!want.includes(r.code)) throw new Error(`SMTP ${label} refused: ${r.text}`);
    return r;
  };
  try {
    let r = await read();
    if (r.code !== 220) throw new Error("SMTP greeting: " + r.text);
    const helo = cfg.helo || m.from.split("@")[1] || "localhost";
    r = await cmd(`EHLO ${helo}`, [250]);
    if (cfg.port !== 465) {
      if (!/STARTTLS/i.test(r.text)) throw new Error("SMTP server offers no STARTTLS");
      await cmd("STARTTLS", [220]);
      conn = await Deno.startTls(conn as Deno.TcpConn, { hostname: cfg.host });
      buf = "";
      await cmd(`EHLO ${helo}`, [250]);
    }
    await cmd("AUTH PLAIN " + b64("\u0000" + cfg.user + "\u0000" + cfg.pass), [235], "AUTH");
    await cmd(`MAIL FROM:<${m.from}>`, [250], "MAIL FROM");
    await cmd(`RCPT TO:<${m.to}>`, [250, 251], "RCPT TO");
    await cmd("DATA", [354]);
    // Dot-stuffing (RFC 5321 §4.5.2), then the terminating "."
    const data = raw.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    const done = await cmd(data + (data.endsWith("\r\n") ? "" : "\r\n") + ".", [250], "DATA end");
    try { await write("QUIT\r\n"); } catch { /* ignore */ }
    return { messageId, reply: done.text };
  } finally {
    clearTimeout(timer);
    try { conn.close(); } catch { /* closed */ }
  }
}
