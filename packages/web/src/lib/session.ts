/**
 * Abgemeldet von außen („Überall abmelden“, gesperrt, Passwort geändert): Der Server meldet das
 * sofort über die Live-Verbindung (bzw. eine Anfrage antwortet mit 401). Dann Zugang löschen und
 * die Seite zur Anmeldung schicken – ohne Neuladen.
 */
import { setToken, type TokenSlot } from './storage.ts';

const listeners = new Set<(slot: TokenSlot) => void>();

export function onSessionEnded(fn: (slot: TokenSlot) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function endSession(slot: TokenSlot) {
  setToken(slot, null);
  for (const fn of listeners) fn(slot);
}
