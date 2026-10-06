/**
 * Beamer-Einstellungen kommen live aus der Regie (Beamer-Show). Hier nur, was ein einzelnes
 * Gerät zum Testen überschreiben darf: `?quality=ultra|high|balanced|eco` erzwingt eine Grafikstufe.
 */
import type { RenderQuality } from '@insel/shared';
import { readJson } from '../../lib/storage.ts';

const LEGACY: Record<string, RenderQuality> = { beauty: 'high', fast: 'eco' };

export function qualityOverride(): RenderQuality | null {
  const q = new URLSearchParams(window.location.search).get('quality');
  if (q === 'ultra' || q === 'high' || q === 'balanced' || q === 'eco') return q;
  if (q && LEGACY[q]) return LEGACY[q];
  // ältere Prüfskripte setzen die Stufe noch im lokalen Speicher
  const stored = readJson<{ quality?: string }>('insel.beamer', {}).quality;
  return stored ? (LEGACY[stored] ?? null) : null;
}
