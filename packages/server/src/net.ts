/**
 * Wer schickt die Anfrage? Echte Client-Adressen (Cf-Connecting-Ip, X-Forwarded-For) werden
 * nur von vertrauenswürdigen Vorschaltservern übernommen: einem Tunnel/Proxy im Docker-Netz der
 * Insel oder einem per TRUST_PROXY eingetragenen. Von allen anderen zählt die Verbindungsadresse.
 */
import { isIP } from 'node:net';
import { config } from './config.ts';

/** Container in Docker-Netzen – aber nicht das Gateway (.1), über das Port-Zugriffe kommen. */
const DOCKER_PEER = /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/;

const v4ToInt = (a: string) => a.split('.').reduce((n, p) => n * 256 + Number(p), 0);

interface Trusted {
  exact: Set<string>;
  ranges: { base: number; bits: number }[];
}

export function parseTrusted(spec: string): Trusted {
  const out: Trusted = { exact: new Set(), ranges: [] };
  for (const raw of spec.split(',')) {
    const part = raw.trim().toLowerCase();
    if (!part) continue;
    const [addr, bitsRaw] = part.split('/');
    if (bitsRaw !== undefined && isIP(addr!) === 4) {
      const bits = Number(bitsRaw);
      if (Number.isInteger(bits) && bits >= 8 && bits <= 32) out.ranges.push({ base: v4ToInt(addr!), bits });
    } else if (isIP(part)) {
      out.exact.add(normalizeIp(part));
    }
  }
  return out;
}

const extra = parseTrusted(config.trustProxy);

function inTrusted(ip: string, t: Trusted): boolean {
  if (t.exact.has(ip)) return true;
  if (isIP(ip) !== 4) return false;
  const n = v4ToInt(ip);
  return t.ranges.some(({ base, bits }) => {
    const size = 2 ** (32 - bits);
    return Math.floor(n / size) === Math.floor(base / size);
  });
}

/** IPv4 in IPv6-Schreibweise (::ffff:1.2.3.4) → 1.2.3.4, sonst klein geschrieben. */
export function normalizeIp(addr: string): string {
  const a = addr.trim().toLowerCase();
  return a.startsWith('::ffff:') && isIP(a.slice(7)) === 4 ? a.slice(7) : a;
}

export function isTrustedProxy(addr: string, trusted: Trusted = extra): boolean {
  const a = normalizeIp(addr);
  if (inTrusted(a, trusted)) return true;
  if (a === '127.0.0.1' || a === '::1') return !config.isProduction; // Vite-Entwicklungsproxy
  return DOCKER_PEER.test(a) && !a.endsWith('.1');
}

type Headers = Record<string, string | string[] | undefined>;

/**
 * Absender einer Anfrage. `distinct` = die Adresse stammt von einem vertrauenswürdigen Tunnel/Proxy
 * und unterscheidet damit Anschlüsse; sonst (direkter Zugriff über den Docker-Port, WLAN) kommen
 * alle Geräte über dieselbe Adresse.
 */
export function clientAddress(peer: string | undefined, headers: Headers, trusted: Trusted = extra): { ip: string; distinct: boolean } {
  const direct = normalizeIp(peer ?? '');
  if (!isTrustedProxy(direct, trusted)) return { ip: direct, distinct: false };
  const cf = headers['cf-connecting-ip'];
  if (typeof cf === 'string' && isIP(cf.trim())) return { ip: normalizeIp(cf), distinct: true };
  // X-Forwarded-For von rechts lesen: die erste Adresse, die kein eigener Proxy ist
  const xff = headers['x-forwarded-for'];
  const hops = (Array.isArray(xff) ? xff.join(',') : (xff ?? '')).split(',').map((h) => h.trim()).filter(Boolean);
  for (let i = hops.length - 1; i >= 0; i--) {
    const hop = hops[i]!;
    if (!isIP(hop)) break;
    if (!isTrustedProxy(hop, trusted)) return { ip: normalizeIp(hop), distinct: true };
  }
  return { ip: direct, distinct: false };
}

/**
 * Schlüssel für Bremsen und Verbindungsgrenzen: IPv6 je Anschluss (/64) zusammenfassen – ein
 * Angreifer hat dort Milliarden Adressen, ein Haushalt/Handy aber nur ein /64.
 */
export function ipKey(ip: string): string {
  const a = normalizeIp(ip);
  if (isIP(a) !== 6) return a;
  const [head = '', tail] = a.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groupsOf = (g: string[]) => g.reduce((n, x) => n + (x.includes('.') ? 2 : 1), 0);
  const fill = tail !== undefined ? Array<string>(Math.max(0, 8 - groupsOf(h) - groupsOf(t))).fill('0') : [];
  const all = [...h, ...fill, ...t];
  return `${all.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(':')}::/64`;
}

/** Hinweis beim Start: TRUST_PROXY nur sinnvoll, wenn der Port nicht von außen erreichbar ist. */
export function trustWarning(): string | null {
  if (!config.trustProxy) return null;
  // in Docker zählt die Port-Bindung am Host (HOST_BIND), ohne Docker die eigene (HOST)
  const bind = (config.hostBind || config.host).trim();
  if (bind === '127.0.0.1' || bind === '::1' || bind === 'localhost') return null;
  return `⚠️  TRUST_PROXY ist gesetzt, aber der Port ist nicht nur lokal gebunden (HOST_BIND=${bind || 'leer'}). Bitte HOST_BIND=127.0.0.1 in .env setzen – sonst lässt sich die Absenderadresse fälschen.`;
}
