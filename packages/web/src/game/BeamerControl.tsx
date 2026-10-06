/**
 * Beamer-Fernsteuerung für Regie (und Moderator): Grafik, Vollbild, Ton & Musik mit
 * Lautstärken, Kommentator, Kamera samt Steuerkreuz, Spielerklärung, Testtöne, Neu laden.
 * Funktioniert unabhängig vom Spielstand – auch ohne Spiel und in der Lobby.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  Maximize,
  Mic,
  Minus,
  Monitor,
  Music,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Sparkles,
  Square,
  Volume2,
  Waves,
} from 'lucide-react';
import {
  MUSIC_MOOD_LABEL,
  MUSIC_MOODS,
  MUSIC_TRACKS,
  QUALITY_INFO,
  QUALITY_LEVELS,
  RESOLUTION_INFO,
  RESOLUTIONS,
  type Resolution,
  teamColor,
  type CameraCommand,
  type CommentaryLevel,
  type ShowPatch,
  type ShowSettings,
} from '@insel/shared';
import { pairBeamer, sendShow, useLive } from '../lib/live.ts';
import { Badge, Button, Card, CardHeader, Segmented, Switch } from '../ui/basics.tsx';
import { toast } from '../ui/toast.tsx';

async function patch(p: ShowPatch) {
  const r = await sendShow({ type: 'set', patch: p });
  if (!r.ok) toast.error(r.error ?? 'Beamer konnte nicht gesteuert werden');
}

function camera(cmd: Omit<CameraCommand, 'type'>) {
  void sendShow({ type: 'camera', ...cmd }).then((r) => !r.ok && toast.error(r.error ?? 'Kamera nicht erreichbar'));
}

/** Schieberegler, der während des Ziehens gedrosselt live sendet. */
function VolumeSlider({ value, onChange, disabled, label }: { value: number; onChange: (v: number) => void; disabled?: boolean; label: string }) {
  const [local, setLocal] = useState(value);
  const last = useRef(0);
  const timer = useRef<number | null>(null);
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) setLocal(value);
  }, [value]);
  const send = (v: number) => {
    const now = performance.now();
    if (timer.current) clearTimeout(timer.current);
    if (now - last.current > 120) {
      last.current = now;
      onChange(v);
    } else timer.current = window.setTimeout(() => onChange(v), 130);
  };
  return (
    <input
      type="range"
      aria-label={label}
      min={0}
      max={100}
      value={Math.round(local * 100)}
      disabled={disabled}
      onPointerDown={() => (dragging.current = true)}
      onPointerUp={() => (dragging.current = false)}
      onChange={(e) => {
        const v = Number(e.target.value) / 100;
        setLocal(v);
        send(v);
      }}
      className="w-full accent-[var(--accent)] disabled:opacity-40"
    />
  );
}

function AudioRow({
  icon,
  label,
  on,
  volume,
  onToggle,
  onVolume,
  test,
}: {
  icon: React.ReactNode;
  label: string;
  on: boolean;
  volume: number;
  onToggle: (v: boolean) => void;
  onVolume: (v: number) => void;
  test?: () => void;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-1.5">
      <Switch checked={on} onChange={onToggle} />
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-bold">
          {icon} {label} <span className="ml-auto text-xs font-semibold text-muted tabular-nums">{on ? `${Math.round(volume * 100)} %` : 'aus'}</span>
        </p>
        <VolumeSlider value={volume} onChange={onVolume} disabled={!on} label={`${label} Lautstärke`} />
      </div>
      {test ? (
        <Button size="sm" variant="ghost" onClick={test} title="Testton auf dem Beamer">
          Test
        </Button>
      ) : (
        <span />
      )}
    </div>
  );
}

/** Steuerkreuz: gedrückt halten = weiter drehen/zoomen. */
function PadButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  const timer = useRef<number | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
        stop();
        timer.current = window.setInterval(onPress, 160);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      className="grid size-12 place-items-center rounded-2xl border border-line bg-surface text-ink-2 shadow-soft transition select-none active:scale-95 active:bg-accent-soft"
    >
      {children}
    </button>
  );
}

/**
 * Neuen Beamer freigeben: Ein Beamer ohne Zugang zeigt einen vierstelligen Code – erst nach
 * der Freigabe sieht er Fotos, Beitritts-Adressen und Spielverlauf.
 */
function PairBeamer() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(code)) return;
    setBusy(true);
    const r = await pairBeamer(code);
    setBusy(false);
    if (r.ok) {
      toast.success('Beamer freigegeben');
      setCode('');
    } else toast.error(r.error ?? 'Freigabe fehlgeschlagen');
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 rounded-2xl bg-bg-2 px-3 py-2">
      <label htmlFor="beamer-pair" className="min-w-0 flex-1 text-sm font-semibold text-ink-2">
        Beamer zeigt einen Code? Hier eingeben, um ihn freizugeben:
      </label>
      <input
        id="beamer-pair"
        className="field h-10 w-28 text-center font-mono text-lg tracking-[0.3em]"
        inputMode="numeric"
        autoComplete="off"
        placeholder="0000"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
      />
      <Button type="submit" size="sm" variant="primary" loading={busy} disabled={code.length !== 4}>
        Freigeben
      </Button>
    </form>
  );
}

function BeamerStatusList() {
  const beamers = useLive((s) => s.beamers);
  const presence = useLive((s) => s.presence);
  if (!beamers.length) {
    return (
      <p className="rounded-2xl bg-warn-soft px-4 py-3 text-sm font-semibold">
        Kein Beamer verbunden{presence.beamer ? ' (lädt noch …)' : ''}. Öffne <a href="/beamer" target="insel-beamer" className="underline">/beamer</a> auf dem Beamer-Rechner – am besten mit <code>./start.sh beamer</code> (Kiosk: Vollbild und Ton ohne Klick).
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {beamers.map((b, i) => (
        <li key={b.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-bg-2 px-3 py-2 text-sm">
          <Monitor className="size-4 text-muted" />
          <span className="font-bold">Beamer {beamers.length > 1 ? i + 1 : ''}</span>
          <Badge tone={b.fps >= 45 ? 'good' : b.fps >= 28 ? 'warn' : 'bad'}>{b.fps} fps</Badge>
          <Badge>{QUALITY_INFO[b.quality].label}</Badge>
          <Badge tone={b.audio ? 'good' : 'warn'}>{b.audio ? '🔊 Ton an' : '🔇 einmal am Beamer klicken'}</Badge>
          {b.fullscreen && <Badge tone="accent">Vollbild</Badge>}
          {b.manual && <Badge tone="accent">🎥 freie Kamera</Badge>}
          {b.explaining && <Badge tone="accent">🎙️ Erklärung läuft</Badge>}
          <span className="ml-auto text-xs text-muted tabular-nums">
            {b.width}×{b.height}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ExplainerControl() {
  const explainer = useLive((s) => s.show.explainer);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {explainer.running ? (
        <Button variant="bad" icon={<Square className="size-4" />} onClick={() => void sendShow({ type: 'explain', action: 'stop' })}>
          Erklärung stoppen
        </Button>
      ) : (
        <Button variant="primary" icon={<Play className="size-4" />} onClick={() => void sendShow({ type: 'explain', action: 'start' })}>
          Spielerklärung starten
        </Button>
      )}
      <span className="text-sm text-muted">DiMario erklärt in gut 2 Minuten das ganze Spiel – mit Kamerafahrt und Vorführung. Am besten in der Lobby.</span>
    </div>
  );
}

function CameraPad() {
  const state = useLive((s) => s.state);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" icon={<Camera className="size-4" />} onClick={() => camera({ action: 'auto' })}>
          Automatik
        </Button>
        <Button size="sm" onClick={() => camera({ action: 'overview' })}>
          🏝️ Insel
        </Button>
        <Button size="sm" onClick={() => camera({ action: 'start' })}>
          🚩 Start
        </Button>
        <Button size="sm" onClick={() => camera({ action: 'volcano' })}>
          🌋 Vulkan
        </Button>
        <Button size="sm" onClick={() => camera({ action: 'goal' })}>
          🏁 Gipfel
        </Button>
      </div>
      {state && state.teams.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {state.teams.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => camera({ action: 'team', teamId: t.id })}
              className="rounded-full px-3 py-1 text-sm font-bold text-white shadow-soft"
              style={{ background: teamColor(t.color).hex }}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-5">
        <div className="grid grid-cols-3 gap-1.5">
          <span />
          <PadButton label="Nach vorn schieben" onPress={() => camera({ action: 'nudge', panZ: 0.06 })}>
            <ArrowUp className="size-5" />
          </PadButton>
          <span />
          <PadButton label="Nach links schieben" onPress={() => camera({ action: 'nudge', panX: -0.06 })}>
            <ArrowLeft className="size-5" />
          </PadButton>
          <span className="grid place-items-center text-xs font-bold text-muted">schieben</span>
          <PadButton label="Nach rechts schieben" onPress={() => camera({ action: 'nudge', panX: 0.06 })}>
            <ArrowRight className="size-5" />
          </PadButton>
          <span />
          <PadButton label="Nach hinten schieben" onPress={() => camera({ action: 'nudge', panZ: -0.06 })}>
            <ArrowDown className="size-5" />
          </PadButton>
          <span />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <PadButton label="Links drehen" onPress={() => camera({ action: 'nudge', yaw: 0.12 })}>
            <RotateCcw className="size-5" />
          </PadButton>
          <PadButton label="Rechts drehen" onPress={() => camera({ action: 'nudge', yaw: -0.12 })}>
            <RotateCw className="size-5" />
          </PadButton>
          <PadButton label="Steiler (von oben)" onPress={() => camera({ action: 'nudge', pitch: 0.06 })}>
            <ArrowUp className="size-5" />
          </PadButton>
          <PadButton label="Flacher" onPress={() => camera({ action: 'nudge', pitch: -0.06 })}>
            <ArrowDown className="size-5" />
          </PadButton>
        </div>
        <div className="grid gap-1.5">
          <PadButton label="Näher heran" onPress={() => camera({ action: 'nudge', zoom: -0.12 })}>
            <Plus className="size-5" />
          </PadButton>
          <PadButton label="Weiter weg" onPress={() => camera({ action: 'nudge', zoom: 0.12 })}>
            <Minus className="size-5" />
          </PadButton>
        </div>
      </div>
      <p className="text-xs text-muted">Nach 60 Sekunden ohne Eingabe übernimmt wieder die Automatik. Am Beamer selbst geht es auch mit Maus (ziehen, Rad, rechte Taste) oder Touch.</p>
    </div>
  );
}

/** Vollständige Steuerseite (Regie → Beamer). */
export function BeamerControl() {
  const s = useLive((x) => x.show.settings);
  const firstBeamer = useLive((x) => x.beamers[0]);
  const set = (p: ShowPatch) => void patch(p);
  const test = (what: 'sound' | 'voice' | 'music') => void sendShow({ type: 'test', what });

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader
          title="Beamer"
          icon={<Monitor className="size-5 text-accent" />}
          sub="Alles hier wirkt sofort auf allen Beamern – auch ohne laufendes Spiel."
          actions={
            <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" />} onClick={() => void sendShow({ type: 'reload' })}>
              Neu laden
            </Button>
          }
        />
        <div className="flex flex-col gap-4 p-5">
          <BeamerStatusList />
          <PairBeamer />
          <ExplainerControl />
        </div>
      </Card>

      <Card>
        <CardHeader title="Bild" icon={<Sparkles className="size-5 text-accent" />} />
        <div className="flex flex-col gap-4 p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {QUALITY_LEVELS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => set({ quality: q })}
                className={`rounded-2xl border-2 p-3 text-left transition ${s.quality === q ? 'border-accent bg-accent-soft/40' : 'border-line hover:border-accent/40'}`}
              >
                <span className="block text-2xl">{QUALITY_INFO[q].icon}</span>
                <span className="block font-bold">{QUALITY_INFO[q].label}</span>
              </button>
            ))}
          </div>
          <p className="text-sm text-muted">{QUALITY_INFO[s.quality].text}</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold">Auflösung</span>
            <Segmented<Resolution> size="sm" value={s.resolution} onChange={(v) => set({ resolution: v })} options={RESOLUTIONS.map((r) => ({ value: r, label: RESOLUTION_INFO[r] }))} />
          </div>
          <p className="-mt-2 text-xs text-muted">
            Automatisch richtet sich nach der Grafikstufe. Niedriger = flüssiger, höher = schärfer. Tatsächlich gerendert wird gerade: {firstBeamer ? `${firstBeamer.width}×${firstBeamer.height}` : '–'}.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Switch checked={s.fullscreen} onChange={(v) => set({ fullscreen: v })} label={<span className="inline-flex items-center gap-1.5"><Maximize className="size-4" /> Vollbild</span>} />
            <Switch checked={s.hud} onChange={(v) => set({ hud: v })} label="Rangliste & Kopfzeile" />
            <Switch checked={s.tags} onChange={(v) => set({ tags: v })} label="Namensschilder" />
            <Switch checked={s.photos} onChange={(v) => set({ photos: v })} label="Foto-Blasen beim Ziehen" />
            <Switch checked={s.fps} onChange={(v) => set({ fps: v })} label="Bildrate anzeigen" />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Ton & Musik" icon={<Volume2 className="size-5 text-accent" />} />
        <div className="flex flex-col gap-1 p-5">
          <div className="grid grid-cols-[auto_1fr] items-center gap-3 pb-2">
            <Volume2 className="size-5 text-muted" />
            <div>
              <p className="text-sm font-bold">
                Gesamtlautstärke <span className="float-right text-xs font-semibold text-muted tabular-nums">{Math.round(s.master * 100)} %</span>
              </p>
              <VolumeSlider value={s.master} onChange={(v) => set({ master: v })} label="Gesamtlautstärke" />
            </div>
          </div>
          <AudioRow icon={<Music className="size-4" />} label="Musik" on={s.music} volume={s.musicVolume} onToggle={(v) => set({ music: v })} onVolume={(v) => set({ musicVolume: v })} test={() => test('music')} />
          <AudioRow icon={<Sparkles className="size-4" />} label="Effekte" on={s.sound} volume={s.soundVolume} onToggle={(v) => set({ sound: v })} onVolume={(v) => set({ soundVolume: v })} test={() => test('sound')} />
          <AudioRow icon={<Mic className="size-4" />} label="Kommentator" on={s.voice} volume={s.voiceVolume} onToggle={(v) => set({ voice: v })} onVolume={(v) => set({ voiceVolume: v })} test={() => test('voice')} />
          <div className="mb-2 flex flex-wrap items-center gap-3 pl-8">
            <select
              className="field h-9 w-auto py-1 text-sm"
              aria-label="Musikstück"
              value={s.musicTrack}
              onChange={(e) => set({ musicTrack: e.target.value as ShowSettings['musicTrack'] })}
            >
              <option value="auto">🎼 Automatisch passend zum Spiel</option>
              {MUSIC_MOODS.map((m) => (
                <optgroup key={m} label={MUSIC_MOOD_LABEL[m]}>
                  {MUSIC_TRACKS.filter((t) => t.mood === m).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <Switch checked={s.musicRotate} disabled={s.musicTrack !== 'auto'} onChange={(v) => set({ musicRotate: v })} label="Stücke abwechseln" />
          </div>
          <AudioRow icon={<Waves className="size-4" />} label="Umgebung (Meer, Dschungel, Vulkan)" on={s.ambience} volume={s.ambienceVolume} onToggle={(v) => set({ ambience: v })} onVolume={(v) => set({ ambienceVolume: v })} />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold">Kommentator spricht</span>
            <Segmented<CommentaryLevel>
              size="sm"
              value={s.commentary}
              onChange={(v) => set({ commentary: v })}
              options={[
                { value: 'off', label: 'nie' },
                { value: 'some', label: 'ab und zu' },
                { value: 'lots', label: 'viel' },
                { value: 'crazy', label: '🤪 Quatschkopf' },
              ]}
            />
          </div>
          <p className="text-xs text-muted">
            {s.commentary === 'crazy'
              ? 'Redet ständig, lästert über Führende und Letzte und haut auch mal ziemlich dumme Sprüche raus.'
              : s.commentary === 'lots'
                ? 'Kommentiert fast jeden Zug und plaudert auch zwischendurch.'
                : s.commentary === 'some'
                  ? 'Meldet sich bei den wichtigen Momenten.'
                  : 'Kein Kommentar – nur Erklärung und Siegerehrung.'}
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Kamera" icon={<Camera className="size-5 text-accent" />} />
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center gap-4">
            <Segmented<ShowSettings['camera']>
              value={s.camera}
              onChange={(v) => set({ camera: v })}
              options={[
                { value: 'calm', label: '🧘 Ruhig' },
                { value: 'lively', label: '⚡ Lebhaft' },
              ]}
            />
            <Switch checked={s.reactions} onChange={(v) => set({ reactions: v })} label="Reaktion nach jedem Zug" />
          </div>
          <CameraPad />
        </div>
      </Card>

      <div className="xl:col-span-2">
        <Button size="sm" variant="ghost" onClick={() => void sendShow({ type: 'reset' })}>
          Alle Beamer-Einstellungen zurücksetzen
        </Button>
      </div>
    </div>
  );
}

/** Kompakte Karte für die Live-Seite: das Wichtigste auf einen Blick. */
export function BeamerQuick() {
  const s = useLive((x) => x.show.settings);
  const beamers = useLive((x) => x.beamers);
  const explaining = useLive((x) => x.show.explainer.running);
  const set = (p: ShowPatch) => void patch(p);
  const b = beamers[0];
  return (
    <Card>
      <CardHeader
        title="Beamer"
        icon={<Monitor className="size-5 text-accent" />}
        sub={b ? `${b.fps} fps · ${QUALITY_INFO[b.quality].label}${b.audio ? '' : ' · Ton noch gesperrt'}` : 'nicht verbunden'}
        actions={
          <Link to="/regie/beamer" className="btn btn-ghost h-9 px-3 text-sm">
            Alle Regler
          </Link>
        }
      />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Switch checked={s.music} onChange={(v) => set({ music: v })} label="Musik" />
          <Switch checked={s.sound} onChange={(v) => set({ sound: v })} label="Effekte" />
          <Switch checked={s.voice} onChange={(v) => set({ voice: v })} label="Kommentator" />
        </div>
        <div>
          <p className="mb-1 text-xs font-bold text-muted">Gesamtlautstärke</p>
          <VolumeSlider value={s.master} onChange={(v) => set({ master: v })} label="Gesamtlautstärke" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Camera className="size-4" />} onClick={() => camera({ action: 'auto' })}>
            Kamera: Automatik
          </Button>
          <Button size="sm" variant={explaining ? 'bad' : 'soft'} icon={explaining ? <Square className="size-4" /> : <Play className="size-4" />} onClick={() => void sendShow({ type: 'explain', action: explaining ? 'stop' : 'start' })}>
            {explaining ? 'Erklärung stoppen' : 'Erklärung'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
