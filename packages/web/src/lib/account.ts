/** Angemeldetes Konto der Regie (Haupt-Admin oder Spielleiter) und sein gewähltes Spiel. */
import { create } from 'zustand';
import { api } from './api.ts';
import type { TokenSlot } from './storage.ts';

export interface AccountInfo {
  /** null = Haupt-Admin (Passwort aus .env) */
  id: string | null;
  name: string;
  email: string | null;
  isAdmin: boolean;
  /** Haupt-Admin */
  main: boolean;
}

export interface Me {
  session: { role: string; gameId?: string | null };
  authDisabled: boolean;
  account: AccountInfo | null;
  game: { id: string; code: string; name: string } | null;
  team: { id: string; name: string; color: string } | null;
  player: { id: string; name: string } | null;
}

export const useAccount = create<{ account: AccountInfo | null }>(() => ({ account: null }));

export async function loadMe(slot: TokenSlot): Promise<Me> {
  const me = await api<Me>('/api/auth/me', { slot });
  if (slot === 'admin') useAccount.setState({ account: me.account });
  return me;
}
