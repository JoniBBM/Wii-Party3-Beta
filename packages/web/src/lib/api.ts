/** REST-Aufrufe mit Token und deutschen Fehlermeldungen. */
import { getToken, type TokenSlot } from './storage.ts';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; slot?: TokenSlot; token?: string | null; form?: FormData } = {},
): Promise<T> {
  const token = opts.token !== undefined ? opts.token : opts.slot ? getToken(opts.slot) : null;
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(path, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body });
  } catch {
    throw new ApiError(0, 'Keine Verbindung zum Spielserver');
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `Fehler ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export async function downloadFile(path: string, slot: TokenSlot) {
  const token = getToken(slot);
  const res = await fetch(path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, 'Download fehlgeschlagen');
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'export.json';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = decodeURIComponent(name);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface SystemInfo {
  appName: string;
  version: string;
  authDisabled: boolean;
  joinUrls: { kind: string; label: string; url: string }[];
  joinUrl: string | null;
  activeGameId: string | null;
  serverNow: number;
}
