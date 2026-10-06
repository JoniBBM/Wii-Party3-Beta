/**
 * Startseite: Mitspielen (groß), Vorschau der Insel, was einen erwartet – und dezent die
 * Zugänge für die Spielleitung (Beamer, Regie, Moderator).
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, Clapperboard, Gamepad2, Mic, MonitorPlay, Users } from 'lucide-react';
import { api, type SystemInfo } from '../lib/api.ts';
import { getToken } from '../lib/storage.ts';
import { useTheme } from '../lib/theme.ts';
import { Button } from '../ui/basics.tsx';
import { IslandBackdrop } from '../ui/IslandBackdrop.tsx';

interface Me {
  session: { role: string };
  team: { name: string; color: string } | null;
  player: { name: string } | null;
}

const FEATURES = [
  { icon: '🎲', title: 'Würfeln & Mutproben', text: 'Liane, Fässer oder Kisten, Lavahöhle' },
  { icon: '🧠', title: 'Quiz & Minispiele', text: 'Antworten, buzzern, schätzen – live' },
  { icon: '🌋', title: 'Ab in den Vulkan', text: 'Wer Pech hat, läuft über die Lava' },
];

export function Home() {
  useTheme(false);
  const navigate = useNavigate();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api<SystemInfo>('/api/system/info').then(setInfo).catch(() => {});
    if (getToken('member')) api<Me>('/api/auth/me', { slot: 'member' }).then(setMe).catch(() => {});
  }, []);

  const member = me && (me.session.role === 'team' || me.session.role === 'player') ? me : null;

  return (
    <IslandBackdrop island={false}>
      <main className="mx-auto flex min-h-dvh max-w-6xl flex-col justify-center gap-10 px-5 py-10 sm:px-8">
        <div className="grid items-center gap-10 md:grid-cols-[1.05fr_1fr]">
          {/* Titel und Mitspielen */}
          <section className="animate-pop text-center md:text-left">
            <div className="mx-auto mb-5 grid size-20 place-items-center rounded-[26px] bg-white/85 text-5xl shadow-lifted md:mx-0">🏝️</div>
            <h1 className="font-display text-5xl leading-[1.05] font-semibold text-ink sm:text-6xl">{info?.appName ?? 'Insel der Abenteuer'}</h1>
            <p className="mx-auto mt-4 max-w-md text-lg font-semibold text-ink-2 md:mx-0">
              Das Partyspiel für eure Gruppe: Die Insel läuft auf dem Beamer, gespielt wird mit Handy, Tablet oder Laptop.
            </p>
            <div className="mx-auto mt-7 flex max-w-md flex-col gap-3 md:mx-0">
              {member && (
                <Button variant="primary" size="lg" block icon={<Gamepad2 />} onClick={() => navigate('/team')}>
                  Weiter als {member.player?.name ?? member.team?.name}
                </Button>
              )}
              <Button variant={member ? 'soft' : 'primary'} size="lg" block icon={<Users />} onClick={() => navigate('/join')} className={member ? '' : 'animate-pulse-ring'}>
                Mitspielen
              </Button>
              <p className="text-sm font-semibold text-muted">QR-Code vom Beamer scannen oder hier beitreten.</p>
            </div>
          </section>

          {/* Postkarte von der Insel */}
          <figure className="relative mx-auto w-full max-w-lg">
            <div className="animate-float rotate-[-2deg] overflow-hidden rounded-[30px] border-[7px] border-white bg-white shadow-lifted">
              <img src="/assets/home/insel.webp" alt="Die 3D-Insel mit Vulkan, Dschungel, Fluss und Hafen" className="block aspect-[16/10] w-full object-cover" loading="eager" decoding="async" />
            </div>
            <figcaption className="absolute -bottom-4 left-6 rotate-[3deg] rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-white shadow-lifted">2–10 Teams · live</figcaption>
          </figure>
        </div>

        {/* Was euch erwartet */}
        <ul className="grid gap-3 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="glass flex items-center gap-3 rounded-[22px] px-4 py-3">
              <span className="text-3xl" aria-hidden>
                {f.icon}
              </span>
              <span className="text-left">
                <span className="block font-bold text-ink">{f.title}</span>
                <span className="block text-sm font-semibold text-ink-2">{f.text}</span>
              </span>
            </li>
          ))}
        </ul>

        {/* Für die Spielleitung */}
        <nav aria-label="Für die Spielleitung" className="glass rounded-[24px] p-3">
          <p className="px-2 pt-1 pb-2 text-xs font-bold tracking-wide text-muted uppercase">Für die Spielleitung</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <HomeLink to="/beamer" icon={<MonitorPlay className="size-5" />} label="Beamer" text="Die 3D-Insel für alle" />
            <HomeLink to="/regie" icon={<Clapperboard className="size-5" />} label="Regie" text="Spiel einrichten und steuern" />
            <HomeLink to="/moderator" icon={<Mic className="size-5" />} label="Moderator" text="Fragen vorlesen, Lösungen sehen" />
          </div>
        </nav>
      </main>
    </IslandBackdrop>
  );
}

function HomeLink({ to, icon, label, text }: { to: string; icon: React.ReactNode; label: string; text: string }) {
  return (
    <Link to={to} className="group flex items-center gap-3 rounded-2xl bg-white/70 px-3 py-2.5 text-left transition hover:bg-white hover:shadow-lifted focus-visible:bg-white">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-ink">{label}</span>
        <span className="block truncate text-xs font-semibold text-muted">{text}</span>
      </span>
      <ArrowRight className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
    </Link>
  );
}
