/**
 * Beamer: 3D-Insel mit allen Einblendungen, komplett aus der Regie gesteuert (Grafik, Ton,
 * Musik, Kamera, Vollbild) – kein Einstellungsmenü am Beamer.
 *
 * Zugang: aus dem Beamer-Link (`#bt=…`, z. B. von `./start.sh beamer`), sonst vom Regie-Login
 * auf demselben Rechner. Fehlt beides, zeigt der Beamer einen Code, den die Regie freigibt –
 * bis dahin nur die Insel ohne Fotos, Beitritts-Adressen und Spielverlauf.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.ts';
import { getToken, setToken } from '../../lib/storage.ts';
import type { Caption } from '../../board/director.ts';
import type { BoardScene } from '../../board/scene.ts';
import { reauth, useLive, useLiveConnection } from '../../lib/live.ts';
import { useSystemSync } from '../../lib/system.ts';
import { useTheme } from '../../lib/theme.ts';
import { BoardCanvas } from './BoardCanvas.tsx';
import { Explainer } from './Explainer.tsx';
import { BeamerStatus, CaptionBanner, Ranking, TopBar } from './Hud.tsx';
import { DiceBanner, PhaseOverlay, QuestionSpotlight, VictoryBanner } from './Overlays.tsx';
import { PhotoBubbles } from './PhotoBubbles.tsx';
import { useShowControl } from './useShowControl.ts';

/** Beamer-Zugang einrichten (Link oder Regie-Login auf demselben Rechner); true, sobald geprüft. */
function useBeamerAccess(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const bt = hash.get('bt');
    if (bt) {
      setToken('beamer', bt);
      // Zugang nicht in der Adresszeile (und im Verlauf) stehen lassen
      hash.delete('bt');
      const rest = hash.toString();
      window.history.replaceState(null, '', window.location.pathname + window.location.search + (rest ? `#${rest}` : ''));
    }
    let alive = true;
    void (async () => {
      if (!getToken('beamer') && getToken('admin')) {
        try {
          const r = await api<{ token: string }>('/api/auth/beamer-link', { slot: 'admin', body: {} });
          setToken('beamer', r.token);
        } catch {
          /* Regie-Login abgelaufen → Kopplung per Code */
        }
      }
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

export default function BeamerApp() {
  useTheme(false);
  const access = useBeamerAccess();
  useLiveConnection('beamer', 'beamer', access);
  useSystemSync(access ? 'beamer' : null);
  const { state, status, appName, session, pairCode } = useLive();
  // Zugang abgelaufen (z. B. neues Passwort), aber die Regie ist auf diesem Rechner angemeldet → neu holen
  const renewed = useRef(false);
  useEffect(() => {
    if (session?.role !== 'guest' || !pairCode || renewed.current || !getToken('admin')) return;
    renewed.current = true;
    api<{ token: string }>('/api/auth/beamer-link', { slot: 'admin', body: {} })
      .then((r) => {
        setToken('beamer', r.token);
        reauth();
      })
      .catch(() => {});
  }, [session?.role, pairCode]);
  const [caption, setCaption] = useState<Caption | null>(null);
  const [scene, setScene] = useState<BoardScene | null>(null);
  const onCaption = useCallback((c: Caption | null) => setCaption(c), []);
  const onReady = useCallback((s: BoardScene | null) => setScene(s), []);
  const show = useShowControl(scene, state);
  const [fps, setFps] = useState(0);
  const [fade, setFade] = useState(false);
  useEffect(() => scene?.onFade(setFade), [scene]);

  // Schriftgröße skaliert mit der Bildschirmbreite (720p bis 4K)
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.fontSize;
    root.style.fontSize = 'clamp(11px, 0.83vw, 26px)';
    document.body.style.overflow = 'hidden';
    return () => {
      root.style.fontSize = prev;
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    if (!show.settings.fps || !scene) return;
    const id = window.setInterval(() => setFps(scene.fps), 1000);
    return () => clearInterval(id);
  }, [show.settings.fps, scene]);

  const explaining = show.explainer.running;
  const hud = show.settings.hud && !explaining;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#8fd8ff] select-none">
      <BoardCanvas state={state} onCaption={onCaption} onReady={onReady} />
      {/* Schwarzblende bei harten Schnitten (Insel ↔ Vulkan, Ortswechsel in der Erklärung) */}
      <div className="pointer-events-none absolute inset-0 z-[5] bg-black transition-opacity duration-300 ease-in-out" style={{ opacity: fade ? 1 : 0 }} aria-hidden />

      <div className="pointer-events-none absolute inset-0 z-10">
        {hud && (
          <div className="absolute top-5 left-6">
            <TopBar state={state} appName={appName} />
          </div>
        )}
        {hud && state && state.teams.length > 0 && state.status !== 'lobby' && (
          <div className="absolute top-5 right-6">
            <Ranking state={state} />
          </div>
        )}
        {state && !explaining && <PhaseOverlay state={state} />}
        {state && !explaining && <QuestionSpotlight state={state} />}
        {state && !explaining && <DiceBanner state={state} />}
        {state && !explaining && <VictoryBanner state={state} />}
        {!state && !explaining && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="glass rounded-[2rem] px-10 py-8 text-center">
              <p className="font-display text-5xl font-semibold text-ink">{appName}</p>
              <p className="mt-3 text-2xl font-bold text-ink-2">Die Spielleitung bereitet gerade alles vor …</p>
            </div>
          </div>
        )}
        {!explaining && <CaptionBanner caption={caption} />}
        {state && show.settings.photos && !explaining && <PhotoBubbles state={state} />}
        {status === 'offline' && (
          <div className="absolute top-5 left-1/2 -translate-x-1/2 rounded-full bg-bad px-5 py-2 font-bold text-white shadow-lifted">Verbindung zum Spielserver unterbrochen …</div>
        )}
      </div>

      {session?.role === 'guest' && pairCode && !explaining && <PairCard code={pairCode} />}
      <Explainer scene={scene} state={state} explainer={show.explainer} />
      <BeamerStatus audioReady={show.audioReady} fullscreen={show.fullscreen} wantFullscreen={show.settings.fullscreen} manual={show.manual} fps={fps} showFps={show.settings.fps} />
    </div>
  );
}

/** Noch nicht freigegeben: Code groß zeigen, die Regie gibt ihn unter „Beamer“ frei. */
function PairCard({ code }: { code: string }) {
  return (
    <div className="pointer-events-none absolute right-6 bottom-6 z-30">
      <div className="glass flex items-center gap-6 rounded-[2rem] px-8 py-6">
        <div>
          <p className="text-xl font-bold text-ink-2">Beamer freigeben</p>
          <p className="mt-1 max-w-[24rem] text-lg font-semibold text-muted">In der Regie unter „Beamer“ diesen Code eingeben:</p>
        </div>
        <p className="font-display text-7xl font-semibold tracking-[0.18em] text-ink tabular-nums">{code}</p>
      </div>
    </div>
  );
}
