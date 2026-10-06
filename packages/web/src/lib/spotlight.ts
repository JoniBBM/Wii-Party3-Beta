/**
 * Frage im Rampenlicht (Beamer): erst groß in der Bildmitte, dann fliegt sie an ihren Platz in
 * der Tafel. Gemeinsamer Zustand für die Einblendung und die Regie der Animationen (Vorlesen).
 */
import { create } from 'zustand';

export const useSpotlight = create<{
  /** Inhalt, der gerade groß gezeigt wird */
  id: string | null;
  /** Platz der Frage in der Tafel (Ziel des Flugs) */
  target: DOMRect | null;
  /** Wie lange die Frage groß bleibt (Länge der Sprachaufnahme); null = Lesezeit */
  holdMs: number | null;
}>(() => ({ id: null, target: null, holdMs: null }));

export function setSpotlightHold(ms: number | null) {
  useSpotlight.setState({ holdMs: ms });
}
