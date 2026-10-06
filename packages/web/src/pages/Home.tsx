import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Clapperboard, Gamepad2, Mic, MonitorPlay, Users } from 'lucide-react';
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
    <IslandBackdrop>
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-8 px-5 py-10 text-center">
        <div className="animate-pop">
          <div className="mx-auto mb-4 grid size-24 place-items-center rounded-[30px] bg-white/80 text-6xl shadow-lifted animate-float">🏝️</div>
          <h1 className="text-4xl font-bold text-ink sm:text-5xl">{info?.appName ?? 'Insel der Abenteuer'}</h1>
          <p className="mt-2 text-lg font-semibold text-ink-2">Das Partyspiel für eure Gruppe</p>
        </div>

        <div className="glass flex w-full flex-col gap-3 rounded-[28px] p-5">
          {member ? (
            <Button variant="primary" size="lg" block icon={<Gamepad2 />} onClick={() => navigate('/team')}>
              Weiter als {member.player?.name ?? member.team?.name}
            </Button>
          ) : null}
          <Button variant={member ? 'soft' : 'primary'} size="lg" block icon={<Users />} onClick={() => navigate('/join')}>
            Mitspielen
          </Button>
        </div>

        <nav className="grid w-full grid-cols-3 gap-3 text-sm font-bold text-ink-2">
          <HomeLink to="/beamer" icon={<MonitorPlay className="size-6" />} label="Beamer" />
          <HomeLink to="/regie" icon={<Clapperboard className="size-6" />} label="Regie" />
          <HomeLink to="/moderator" icon={<Mic className="size-6" />} label="Moderator" />
        </nav>
      </div>
    </IslandBackdrop>
  );
}

function HomeLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="glass flex flex-col items-center gap-1.5 rounded-2xl px-3 py-4 transition hover:-translate-y-0.5 hover:shadow-lifted">
      {icon}
      {label}
    </Link>
  );
}
