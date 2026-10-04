import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommandInput } from '@insel/shared';
import { sendCommand, serverNow, type Ack } from './live.ts';
import { toast } from '../ui/toast.tsx';

/** Aktuelle Serverzeit, aktualisiert im angegebenen Intervall. */
export function useServerNow(intervalMs = 250): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Befehl senden mit Ladezustand und Fehler-Toast. */
export function useCommand() {
  const [pending, setPending] = useState<string | null>(null);
  const run = useCallback(async (cmd: CommandInput, opts: { success?: string; quiet?: boolean } = {}): Promise<Ack> => {
    setPending(cmd.type);
    const ack = await sendCommand(cmd);
    setPending(null);
    if (!ack.ok && !opts.quiet) toast.error(ack.error ?? 'Das hat nicht geklappt');
    if (ack.ok && opts.success) toast.success(opts.success);
    return ack;
  }, []);
  return { run, pending };
}

export function useAsync() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setBusy(true);
    try {
      const r = await fn();
      if (success) toast.success(success);
      return r;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Das hat nicht geklappt');
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, run };
}

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const fn = () => setMatch(m.matches);
    m.addEventListener('change', fn);
    fn();
    return () => m.removeEventListener('change', fn);
  }, [query]);
  return match;
}

/** Wert der letzten Darstellung (für Übergänge). */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}
