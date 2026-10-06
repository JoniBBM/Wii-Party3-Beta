import type { ReactNode } from 'react';

/** Heller Himmel-und-Meer-Hintergrund für Start-, Beitritts- und Handyseiten (rein CSS/SVG). */
export function IslandBackdrop({ children, className = '', island = true }: { children: ReactNode; className?: string; island?: boolean }) {
  return (
    <div className={`relative min-h-dvh overflow-hidden ${className}`} style={{ background: 'linear-gradient(180deg, #8fd8ff 0%, #c9efff 45%, #e9f9ff 62%, #7fd2e8 62.2%, #3fb4d6 100%)' }}>
      <svg className="pointer-events-none absolute inset-x-0 top-[8%] h-40 w-full opacity-90" viewBox="0 0 800 160" preserveAspectRatio="none" aria-hidden>
        <g fill="#fff">
          <ellipse cx="130" cy="60" rx="70" ry="22" />
          <ellipse cx="180" cy="48" rx="50" ry="26" />
          <ellipse cx="620" cy="90" rx="90" ry="20" />
          <ellipse cx="670" cy="78" rx="55" ry="24" />
          <ellipse cx="420" cy="30" rx="40" ry="12" opacity="0.7" />
        </g>
      </svg>
      {island && <svg className="pointer-events-none absolute bottom-[30%] left-1/2 h-[26vh] w-[140vw] max-w-[1400px] -translate-x-1/2 sm:bottom-[33%]" viewBox="0 0 1000 200" preserveAspectRatio="xMidYMax meet" aria-hidden>
        <path d="M120 200 Q300 120 420 70 Q470 30 500 22 Q530 30 580 70 Q700 120 880 200 Z" fill="#5fbf55" />
        <path d="M455 50 Q500 10 545 50 Q520 62 500 58 Q480 62 455 50Z" fill="#8a5a3a" />
        <path d="M60 200 Q500 150 940 200 Z" fill="#f4dc94" />
        <path d="M300 160 q10 -60 0 -110 M300 50 q-30 -6 -50 14 M300 50 q30 -10 54 8 M300 50 q-10 -26 -34 -30 M300 50 q12 -26 36 -28" stroke="#6b4b2e" strokeWidth="6" fill="none" strokeLinecap="round" />
        <path d="M720 170 q8 -50 0 -90 M720 80 q-26 -4 -42 12 M720 80 q26 -8 46 6 M720 80 q-8 -22 -28 -26" stroke="#6b4b2e" strokeWidth="5" fill="none" strokeLinecap="round" />
        <g fill="#3e9e3a">
          <ellipse cx="266" cy="52" rx="30" ry="9" transform="rotate(-25 266 52)" />
          <ellipse cx="334" cy="46" rx="32" ry="9" transform="rotate(20 334 46)" />
          <ellipse cx="292" cy="30" rx="22" ry="8" transform="rotate(-60 292 30)" />
          <ellipse cx="692" cy="84" rx="24" ry="8" transform="rotate(-25 692 84)" />
          <ellipse cx="748" cy="80" rx="26" ry="8" transform="rotate(20 748 80)" />
        </g>
      </svg>}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
