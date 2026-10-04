/**
 * Kleiner Wrapper um localStorage – kann in privaten Fenstern fehlen oder werfen.
 * Tokens liegen getrennt nach „Platz“, damit ein Gerät z. B. gleichzeitig Regie und Team testen kann.
 */
export type TokenSlot = 'admin' | 'moderator' | 'member';

const KEY = (slot: TokenSlot) => `insel.token.${slot}`;

export function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStore(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* ignorieren */
  }
}

export const getToken = (slot: TokenSlot) => readStore(KEY(slot));
export const setToken = (slot: TokenSlot, token: string | null) => writeStore(KEY(slot), token);

export function readJson<T>(key: string, fallback: T): T {
  const raw = readStore(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown) {
  writeStore(key, JSON.stringify(value));
}
