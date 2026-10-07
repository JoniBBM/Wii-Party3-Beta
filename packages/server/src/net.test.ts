/**
 * Betrieb hinter einem Tunnel/Proxy: echte Absenderadressen nur von eigenen Proxys, IPv6 je /64,
 * Anmeldebremsen, die weder den Saal im WLAN noch alle Gäste hinter einem Anschluss aussperren.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'insel-net-'));
process.env.ADMIN_PASSWORD = 'test-passwort';

const net = await import('./net.ts');
const auth = await import('./auth.ts');
const common = await import('./http/common.ts');

const req = (peer: string, headers: Record<string, string> = {}) =>
  ({ socket: { remoteAddress: peer }, headers }) as unknown as FastifyRequest;
const TUNNEL = '172.18.0.5'; // cloudflared im Docker-Netz der Insel
const GATEWAY = '172.18.0.1'; // Port-Zugriff (WLAN, Host)

describe('Absenderadresse', () => {
  it('glaubt Weiterleitungs-Headern nur von eigenen Proxys', () => {
    expect(net.isTrustedProxy(TUNNEL)).toBe(true);
    expect(net.isTrustedProxy(`::ffff:${TUNNEL}`)).toBe(true);
    expect(net.isTrustedProxy(GATEWAY)).toBe(false);
    expect(net.isTrustedProxy('192.168.178.20')).toBe(false);
    expect(net.isTrustedProxy('203.0.113.9')).toBe(false);

    expect(net.clientAddress(TUNNEL, { 'cf-connecting-ip': '203.0.113.9' })).toEqual({ ip: '203.0.113.9', distinct: true });
    // direkt über den Port mit gefälschtem Header: zählt nicht als eigene Adresse
    expect(net.clientAddress(GATEWAY, { 'cf-connecting-ip': '203.0.113.9' })).toEqual({ ip: GATEWAY, distinct: false });
    // Unsinn im Header wird ignoriert
    expect(net.clientAddress(TUNNEL, { 'cf-connecting-ip': '<script>' })).toEqual({ ip: TUNNEL, distinct: false });
  });

  it('liest X-Forwarded-For von rechts (vorgeschobene Adressen des Clients zählen nicht)', () => {
    expect(net.clientAddress(TUNNEL, { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }).ip).toBe('203.0.113.9');
    expect(net.clientAddress(TUNNEL, { 'x-forwarded-for': '203.0.113.9, 172.18.0.7' }).ip).toBe('203.0.113.9');
  });

  it('TRUST_PROXY: eigener cloudflared direkt auf dem Server (über das Docker-Gateway)', () => {
    const t = net.parseTrusted('172.16.0.0/12, 10.0.0.7, kaputt, 1.2.3.4/99');
    expect(net.isTrustedProxy(GATEWAY, t)).toBe(true);
    expect(net.isTrustedProxy('10.0.0.7', t)).toBe(true);
    expect(net.isTrustedProxy('10.0.0.8', t)).toBe(false);
    expect(net.isTrustedProxy('172.32.0.1', t)).toBe(false);
    expect(net.clientAddress(GATEWAY, { 'cf-connecting-ip': '2001:db8::1' }, t)).toEqual({ ip: '2001:db8::1', distinct: true });
  });

  it('fasst IPv6 je Anschluss (/64) zusammen', () => {
    expect(net.ipKey('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
    expect(net.ipKey('2001:db8:1:2::abcd')).toBe(net.ipKey('2001:DB8:1:2:ffff::1'));
    expect(net.ipKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(net.ipKey('2001:db8:1:3::1')).not.toBe(net.ipKey('2001:db8:1:2::1'));
    expect(net.ipKey('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(net.ipKey('203.0.113.9')).toBe('203.0.113.9');
  });
});

describe('Anmeldebremsen hinter dem Tunnel', () => {
  const scope = () => `t-${Math.random()}`;
  const viaTunnel = (ip: string) => req(TUNNEL, { 'cf-connecting-ip': ip });

  it('sperrt eine fremde Adresse, nicht die anderen', () => {
    const s = scope();
    const limits = { perMinute: 1000, perIp: 3 };
    for (let i = 0; i < 3; i++) common.noteLoginFailure(s, viaTunnel('198.51.100.1'), limits);
    expect(common.loginThrottled(s, viaTunnel('198.51.100.1'), limits)).toBe(true);
    expect(common.loginThrottled(s, viaTunnel('198.51.100.2'), limits)).toBe(false);
    // IPv6: neue Adresse im selben /64 hilft nicht
    for (let i = 0; i < 3; i++) common.noteLoginFailure(s, viaTunnel(`2001:db8:5:5::${i + 1}`), limits);
    expect(common.loginThrottled(s, viaTunnel('2001:db8:5:5::99'), limits)).toBe(true);
  });

  it('WLAN der Location: nach einer richtigen Anmeldung sperren Tippfehler nicht alle aus', () => {
    const s = scope();
    const limits = { perMinute: 1000, perIp: 3 };
    const venue = viaTunnel('198.51.100.50');
    common.noteLoginSuccess(venue);
    for (let i = 0; i < 10; i++) common.noteLoginFailure(s, venue, limits);
    expect(common.loginThrottled(s, venue, limits)).toBe(false);
  });

  it('ohne echte Adresse (direkt über den Port) gilt nur der globale Eimer', () => {
    const s = scope();
    const limits = { perMinute: 5, perIp: 2 };
    const direct = req(GATEWAY, { 'cf-connecting-ip': '198.51.100.9' });
    for (let i = 0; i < 4; i++) common.noteLoginFailure(s, direct, limits);
    expect(common.loginThrottled(s, direct, limits)).toBe(false);
    common.noteLoginFailure(s, direct, limits);
    expect(common.loginThrottled(s, direct, limits)).toBe(true);
  });

  it('Stundengrenze und unerratbare Codes ohne globalen Eimer', () => {
    const s = scope();
    for (let i = 0; i < 5; i++) auth.spendAttempt(s, { perMinute: 1000, perHour: 5 });
    expect(auth.globalAttemptsExhausted(s, { perMinute: 1000, perHour: 5 })).toBe(true);

    const link = scope();
    const limits = { perMinute: 2, perIp: 1000, global: false };
    for (let i = 0; i < 50; i++) common.noteLoginFailure(link, req(GATEWAY), limits);
    // Unsinn-Codes blockieren die QR-Beitritte der anderen nicht
    expect(common.loginThrottled(link, req(GATEWAY), limits)).toBe(false);
  });
});
