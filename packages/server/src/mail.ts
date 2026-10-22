/**
 * E-Mail-Versand über den SMTP-Server, den der Admin in der Regie einträgt (Einladungen,
 * Passwort zurücksetzen, Testmail). Ohne SMTP zeigt die Regie die Links zum Kopieren an.
 */
import nodemailer from 'nodemailer';
import type { SmtpSettings } from './db.ts';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

type Sender = (smtp: SmtpSettings, mail: Mail) => Promise<void>;

const smtpSender: Sender = async (smtp, mail) => {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.security === 'tls',
    requireTLS: smtp.security === 'starttls',
    ignoreTLS: smtp.security === 'none',
    auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  try {
    await transport.sendMail({
      from: smtp.fromName ? { name: smtp.fromName, address: smtp.fromAddress } : smtp.fromAddress,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
  } finally {
    transport.close();
  }
};

let sender: Sender = smtpSender;

/** Nur für Tests: Versand abfangen. */
export function setMailSenderForTests(fn: Sender | null) {
  sender = fn ?? smtpSender;
}

export async function sendMail(smtp: SmtpSettings, mail: Mail) {
  await sender(smtp, mail);
}

/** Verständliche Fehlermeldung für die Regie (ohne Zugangsdaten). */
export function mailError(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; message?: string };
  if (e.code === 'EAUTH') return 'Anmeldung am Mailserver fehlgeschlagen – Benutzername oder Passwort prüfen.';
  if (e.code === 'ECONNECTION' || e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND' || e.code === 'EDNS') return 'Mailserver nicht erreichbar – Adresse und Port prüfen.';
  if (e.code === 'ETIMEDOUT' || e.code === 'ESOCKET') return 'Zeitüberschreitung beim Mailserver – Port und Verschlüsselung prüfen.';
  if (e.responseCode && e.responseCode >= 500) return `Der Mailserver hat abgelehnt (${e.responseCode}). Absenderadresse prüfen.`;
  return 'E-Mail konnte nicht gesendet werden.';
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Schlichte Mail mit einem Knopf (HTML) und derselben Nachricht als Text. */
export function buttonMail(o: { to: string; subject: string; appName: string; lines: string[]; button: string; url: string; footer: string }): Mail {
  const text = [...o.lines, '', `${o.button}: ${o.url}`, '', o.footer].join('\n');
  const html = `<!doctype html><html lang="de"><body style="margin:0;background:#eef6f8;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1b2a36">
<div style="max-width:520px;margin:24px auto;background:#ffffff;border-radius:20px;padding:28px">
<p style="font-size:28px;margin:0 0 8px">🏝️</p>
<h1 style="font-size:20px;margin:0 0 16px">${esc(o.appName)}</h1>
${o.lines.map((l) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${esc(l)}</p>`).join('\n')}
<p style="margin:24px 0"><a href="${esc(o.url)}" style="display:inline-block;background:#1f8fbf;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">${esc(o.button)}</a></p>
<p style="font-size:12px;line-height:1.5;color:#5b6b78;margin:0 0 8px">Falls der Knopf nicht geht, diese Adresse öffnen:<br>${esc(o.url)}</p>
<p style="font-size:12px;line-height:1.5;color:#5b6b78;margin:0">${esc(o.footer)}</p>
</div></body></html>`;
  return { to: o.to, subject: o.subject, text, html };
}
