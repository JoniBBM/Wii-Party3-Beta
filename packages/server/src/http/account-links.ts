/** Einladungs- und Zurücksetzen-Links erzeugen und per E-Mail verschicken. */
import type { FastifyRequest } from 'fastify';
import { config } from '../config.ts';
import * as db from '../db.ts';
import { buttonMail, mailError, sendMail } from '../mail.ts';
import { issueLink, type LinkPurpose } from '../users.ts';

/**
 * Basisadresse für Links in E-Mails. Bevorzugt PUBLIC_URL bzw. die eingestellte Beitritts-Adresse.
 * Die Adresse aus der Anfrage (Host-Header) nur, wenn ein Admin selbst auslöst – bei „Passwort
 * vergessen“ (öffentlich) nie, sonst könnte ein Angreifer Links auf seine eigene Seite umbiegen.
 */
export function linkBase(database: db.DB, adminReq?: FastifyRequest): string | null {
  const base = config.publicUrl || db.getSettings(database).joinUrl;
  if (base) return base.replace(/\/$/, '');
  if (!adminReq) return null;
  const host = adminReq.headers['x-forwarded-host'] ?? adminReq.headers.host;
  const proto = (adminReq.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
  return typeof host === 'string' && /^[a-z0-9.:[\]-]+$/i.test(host) ? `${proto === 'https' ? 'https' : 'http'}://${host}` : null;
}

export interface LinkDelivery {
  /** Link zum Kopieren (nur für Admins zurückgegeben) */
  link: string | null;
  mailed: boolean;
  mailError?: string;
}

/** Link erzeugen und – wenn SMTP eingerichtet ist – per E-Mail schicken. */
export async function deliverLink(database: db.DB, user: db.UserRecord, purpose: LinkPurpose, adminReq?: FastifyRequest): Promise<LinkDelivery> {
  const token = issueLink(database, user.id, purpose);
  const base = linkBase(database, adminReq);
  const link = base ? `${base}/konto#t=${token}` : null;
  const settings = db.getSettings(database);
  if (!settings.smtp || !link) return { link, mailed: false };
  const appName = settings.appName;
  const mail =
    purpose === 'invite'
      ? buttonMail({
          to: user.email,
          appName,
          subject: `Einladung: Spielleitung bei ${appName}`,
          lines: [`Hallo ${user.name},`, `du wurdest als ${user.role === 'admin' ? 'Admin' : 'Spielleiter'} für „${appName}“ eingeladen.`, 'Lege über den Knopf dein Passwort fest – danach kannst du eigene Spiele anlegen und leiten.'],
          button: 'Passwort festlegen',
          url: link,
          footer: 'Der Link gilt 7 Tage und nur einmal. Falls du nichts damit anfangen kannst, ignoriere diese E-Mail einfach.',
        })
      : buttonMail({
          to: user.email,
          appName,
          subject: `Passwort zurücksetzen – ${appName}`,
          lines: [`Hallo ${user.name},`, 'für dein Konto wurde ein neues Passwort angefordert.', 'Über den Knopf legst du ein neues fest. Danach bist du auf allen anderen Geräten abgemeldet.'],
          button: 'Neues Passwort festlegen',
          url: link,
          footer: 'Der Link gilt eine Stunde und nur einmal. Wenn du das nicht angefordert hast, ignoriere diese E-Mail – dein Passwort bleibt unverändert.',
        });
  try {
    await sendMail(settings.smtp, mail);
    return { link, mailed: true };
  } catch (err) {
    return { link, mailed: false, mailError: mailError(err) };
  }
}
