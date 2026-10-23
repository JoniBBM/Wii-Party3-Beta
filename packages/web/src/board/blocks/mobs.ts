/**
 * Tiere und Mobs der Blockwelt als Kastenmodelle mit eigenen Pixel-Häuten.
 * Allgemeine Kreaturen (Zombie, Skelett, Spinne, Schleim, Schwein, Kuh, Schaf, Huhn, Fledermaus) im
 * Blockspiel-Stil; der explodierende „Knaller“ und der „Glutgeist“ im Nether sind eigene Entwürfe.
 */
import { Pixels, rngFor } from './pixels.ts';
import { buildBoxModel, type BoxModel, type BoxSpec, type Face, type FacePainter } from './boxmodel.ts';

export type MobKind = 'zombie' | 'skeleton' | 'spider' | 'slime' | 'magma' | 'knaller' | 'glutgeist' | 'pig' | 'cow' | 'sheep' | 'chicken' | 'bat';

/** Fläche mit gestreuter Palette */
const speck =
  (palette: string[], salt: string, weights?: number[]): FacePainter =>
  (face, p) =>
    p.speckle(0, 0, p.w, p.h, palette, rngFor(`${salt}-${face}`), weights);

/** Mehrere Maler nacheinander */
const layer =
  (...ps: FacePainter[]): FacePainter =>
  (face, p) => {
    for (const f of ps) f(face, p);
  };

/** nur auf bestimmten Flächen */
const on =
  (faces: Face[], f: FacePainter): FacePainter =>
  (face, p) => {
    if (faces.includes(face)) f(face, p);
  };

const px = (pts: [number, number][], c: string): FacePainter => (_f, p) => {
  for (const [x, y] of pts) p.set(x, y, c);
};

/** unterer Teil einer Fläche in anderer Farbe (z. B. Ärmel, Schuhe) */
const band = (from: number, to: number, palette: string[], salt: string): FacePainter => (face, p) => {
  if (face === 'top' || face === 'bottom') return;
  const rng = rngFor(`${salt}-${face}`);
  for (let y = Math.max(0, from); y < Math.min(p.h, to); y++) for (let x = 0; x < p.w; x++) p.set(x, y, palette[Math.floor(rng.next() * palette.length)]!);
};

const ZOMBIE_SKIN = ['#5f8f4c', '#55834a', '#679a52', '#4b7340'];
const BONE = ['#d6d6d0', '#c8c8c0', '#e2e2dc', '#bdbdb4'];

function legSpec(name: string, pivot: [number, number, number], size: [number, number, number], paint: FacePainter): BoxSpec {
  return { name, size, pivot, from: [-size[0] / 2, -size[1], -size[2] / 2], paint };
}

const SPECS: Record<MobKind, () => BoxSpec> = {
  zombie: () => {
    const skin = speck(ZOMBIE_SKIN, 'zombie');
    const shirt = ['#6b5a45', '#5f4f3c', '#77654d'];
    const pants = ['#3d3b4f', '#35334a', '#45435a'];
    return {
      name: 'body',
      size: [8, 12, 4],
      pivot: [0, 24, 0],
      from: [-4, -12, -2],
      paint: layer(speck(shirt, 'zshirt'), on(['front'], px([[2, 9], [5, 10], [6, 4]], '#4d4033'))),
      children: [
        {
          name: 'head',
          size: [8, 8, 8],
          pivot: [0, 0, 0],
          from: [-4, 0, -4],
          paint: layer(skin, on(['front'], px([[1, 4], [2, 4], [5, 4], [6, 4]], '#1d2a18')), on(['front'], px([[3, 6], [4, 6], [2, 6], [5, 6]], '#3a5530'))),
        },
        // Arme nach vorne gestreckt
        { name: 'armR', size: [4, 12, 4], pivot: [-6, -2, 0], from: [-2, -10, -2], paint: layer(skin, band(0, 4, shirt, 'zs1')) },
        { name: 'armL', size: [4, 12, 4], pivot: [6, -2, 0], from: [-2, -10, -2], paint: layer(skin, band(0, 4, shirt, 'zs2')) },
        legSpec('legR', [-2, -12, 0], [4, 12, 4], layer(speck(pants, 'zp1'), band(10, 12, ['#2a2a2a', '#333333'], 'zf1'))),
        legSpec('legL', [2, -12, 0], [4, 12, 4], layer(speck(pants, 'zp2'), band(10, 12, ['#2a2a2a', '#333333'], 'zf2'))),
      ],
    };
  },
  skeleton: () => {
    const bone = speck(BONE, 'bone');
    return {
      name: 'body',
      size: [8, 12, 4],
      pivot: [0, 24, 0],
      from: [-4, -12, -2],
      paint: (face, p) => {
        p.rect(0, 0, p.w, p.h, '#000000', 0);
        // Rippen
        for (let y = 1; y < 9; y += 2) p.rect(1, y, p.w - 2, 1, BONE[0]!);
        p.rect(Math.floor(p.w / 2) - 1, 0, 2, p.h, BONE[1]!);
        p.rect(1, 10, p.w - 2, 2, BONE[2]!);
        if (face === 'top' || face === 'bottom') p.rect(0, 0, p.w, p.h, BONE[1]!);
      },
      children: [
        {
          name: 'head',
          size: [8, 8, 8],
          pivot: [0, 0, 0],
          from: [-4, 0, -4],
          paint: layer(bone, on(['front'], (f, p) => {
            p.rect(1, 3, 2, 2, '#2b2b2b');
            p.rect(5, 3, 2, 2, '#2b2b2b');
            p.rect(3, 5, 2, 1, '#4a4a4a');
            for (let x = 1; x < 7; x++) p.set(x, 6, x % 2 ? '#3a3a3a' : BONE[2]!);
          })),
        },
        { name: 'armR', size: [2, 12, 2], pivot: [-5, -2, 0], from: [-1, -10, -1], paint: bone },
        { name: 'armL', size: [2, 12, 2], pivot: [5, -2, 0], from: [-1, -10, -1], paint: bone },
        legSpec('legR', [-2, -12, 0], [2, 12, 2], bone),
        legSpec('legL', [2, -12, 0], [2, 12, 2], bone),
      ],
      // Knochen-Gitter braucht Transparenz
      cutout: true,
    };
  },
  spider: () => {
    const fur = speck(['#3b322d', '#342b26', '#463b34', '#2a2320'], 'spider');
    const legs: BoxSpec[] = [];
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1;
      const k = i % 4;
      legs.push({ name: `leg${i}`, size: [16, 2, 2], pivot: [side * 3, 0, -3 + k * 2.4], from: side < 0 ? [-16, -1, -1] : [0, -1, -1], paint: fur });
    }
    return {
      name: 'body',
      size: [10, 8, 12],
      pivot: [0, 9, 3],
      from: [-5, -4, 0],
      paint: fur,
      children: [
        {
          name: 'head',
          size: [8, 8, 8],
          pivot: [0, 0, 0],
          from: [-4, -4, -8],
          paint: layer(fur, on(['front'], px([[1, 3], [2, 3], [5, 3], [6, 3], [2, 2], [5, 2], [3, 4], [4, 4]], '#d61f1f'))),
          children: [],
        },
        ...legs,
      ],
    };
  },
  slime: () => ({
    name: 'body',
    size: [12, 12, 12],
    pivot: [0, 0, 0],
    from: [-6, 0, -6],
    paint: layer(
      (face, p) => {
        for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, x === 0 || y === 0 || x === p.w - 1 || y === p.h - 1 ? '#7fd36b' : (x + y) % 5 === 0 ? '#6cc357' : '#5fb84c');
      },
      on(['front'], (_f, p) => {
        p.rect(2, 3, 2, 2, '#1f4a1a');
        p.rect(8, 3, 2, 2, '#1f4a1a');
        p.rect(6, 8, 2, 1, '#1f4a1a');
      }),
    ),
  }),
  magma: () => ({
    name: 'body',
    size: [12, 12, 12],
    pivot: [0, 0, 0],
    from: [-6, 0, -6],
    paint: layer(
      (face, p) => {
        const rng = rngFor(`magma-${face}`);
        for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, y % 4 === 1 && rng.next() < 0.7 ? '#ff9a1f' : rng.next() < 0.5 ? '#3a1a10' : '#4d2212');
      },
      on(['front'], (_f, p) => {
        p.rect(2, 4, 3, 2, '#ffd34d');
        p.rect(7, 4, 3, 2, '#ffd34d');
      }),
    ),
  }),
  knaller: () => {
    const moss = (face: Face, p: Pixels) => {
      const rng = rngFor(`knaller-${face}`);
      for (let y = 0; y < p.h; y++)
        for (let x = 0; x < p.w; x++) {
          const v = rng.next();
          p.set(x, y, v < 0.35 ? '#4f8f3a' : v < 0.6 ? '#5ea446' : v < 0.8 ? '#3f7330' : v < 0.93 ? '#77b85a' : '#8a8a7a');
        }
      // dunkle Risse
      for (let i = 0; i < 3; i++) {
        let cx = Math.floor(rng.next() * p.w);
        for (let y = 0; y < p.h; y += 1) {
          if (rng.next() < 0.5) cx += rng.next() < 0.5 ? -1 : 1;
          if (rng.next() < 0.4) p.set(cx, y, '#2a4a20');
        }
      }
    };
    const foot: FacePainter = speck(['#3f7330', '#355f29'], 'kfoot');
    return {
      name: 'body',
      size: [12, 12, 12],
      pivot: [0, 3, 0],
      from: [-6, 0, -6],
      paint: layer(
        moss,
        on(['front'], (_f, p) => {
          // wütendes Gesicht mit glühenden Augen
          p.rect(2, 3, 3, 3, '#1b1b1b');
          p.rect(7, 3, 3, 3, '#1b1b1b');
          p.set(3, 4, '#ffb13b');
          p.set(8, 4, '#ffb13b');
          p.rect(1, 2, 3, 1, '#2a4a20');
          p.rect(8, 2, 3, 1, '#2a4a20');
          for (let x = 3; x < 9; x++) p.set(x, 8 + (x % 2), '#1b1b1b');
        }),
      ),
      children: [
        { name: 'fuse', size: [1, 4, 1], pivot: [1, 12, 0], from: [-0.5, 0, -0.5], paint: speck(['#d8d0b8', '#c2b99e'], 'fuse') },
        { name: 'spark', size: [2, 2, 2], pivot: [1, 16, 0], from: [-1, 0, -1], paint: speck(['#fff2a1', '#ffd34d', '#ff9a1f'], 'spark') },
        { name: 'foot0', size: [3, 3, 3], pivot: [-4, 0, -4], from: [-1.5, -3, -1.5], paint: foot },
        { name: 'foot1', size: [3, 3, 3], pivot: [4, 0, -4], from: [-1.5, -3, -1.5], paint: foot },
        { name: 'foot2', size: [3, 3, 3], pivot: [-4, 0, 4], from: [-1.5, -3, -1.5], paint: foot },
        { name: 'foot3', size: [3, 3, 3], pivot: [4, 0, 4], from: [-1.5, -3, -1.5], paint: foot },
      ],
    };
  },
  glutgeist: () => {
    const ember = (face: Face, p: Pixels) => {
      const rng = rngFor(`glut-${face}`);
      for (let y = 0; y < p.h; y++)
        for (let x = 0; x < p.w; x++) {
          const crack = Math.sin(x * 1.3 + Math.sin(y * 0.9) * 2) > 0.85 || rng.next() < 0.06;
          p.set(x, y, crack ? '#ffb23d' : rng.next() < 0.5 ? '#2a0f0b' : '#3a1410');
        }
    };
    const flame: FacePainter = (face, p) => {
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, y < 2 ? '#ffe57a' : y < 4 ? '#ffa31a' : '#e4520f', (x + y) % 3 === 0 && y < 2 ? 0 : 255);
    };
    return {
      name: 'body',
      size: [14, 14, 14],
      pivot: [0, 30, 0],
      from: [-7, 0, -7],
      paint: layer(
        ember,
        on(['front'], (_f, p) => {
          p.rect(2, 4, 4, 2, '#fff2a1');
          p.rect(8, 4, 4, 2, '#fff2a1');
          p.rect(4, 9, 6, 2, '#ffb23d');
          p.rect(5, 10, 4, 2, '#1a0806');
        }),
      ),
      cutout: true,
      children: [0, 1, 2, 3, 4].map((i) => ({
        name: `flame${i}`,
        size: [3, 6, 3] as [number, number, number],
        pivot: [-5 + (i % 3) * 5, 0, i < 3 ? -3 : 3] as [number, number, number],
        from: [-1.5, -6, -1.5] as [number, number, number],
        paint: flame,
        cutout: true,
      })),
    };
  },
  pig: () => {
    const pink = speck(['#f0a5a2', '#e99a97', '#f5b2ae', '#e38e8b'], 'pig');
    return {
      name: 'body',
      size: [10, 8, 16],
      pivot: [0, 6, 0],
      from: [-5, 0, -8],
      paint: pink,
      children: [
        {
          name: 'head',
          size: [8, 8, 8],
          pivot: [0, 4, 8],
          from: [-4, -2, 0],
          paint: layer(pink, on(['front'], px([[1, 2], [6, 2]], '#ffffff')), on(['front'], px([[2, 2], [5, 2]], '#1b1b1b'))),
          children: [{ name: 'snout', size: [4, 3, 1], pivot: [0, 0, 8], from: [-2, 0, 0], paint: layer(speck(['#f7b9b5', '#f2aaa6'], 'snout'), on(['front'], px([[1, 1], [2, 1]], '#9a5a58'))) }],
        },
        legSpec('leg0', [-3, 0, -5], [4, 6, 4], pink),
        legSpec('leg1', [3, 0, -5], [4, 6, 4], pink),
        legSpec('leg2', [-3, 0, 5], [4, 6, 4], pink),
        legSpec('leg3', [3, 0, 5], [4, 6, 4], pink),
      ],
    };
  },
  cow: () => {
    const hide = (face: Face, p: Pixels) => {
      const rng = rngFor(`cow-${face}`);
      const spots = Array.from({ length: 3 }, () => ({ x: rng.next() * p.w, y: rng.next() * p.h, r: 2 + rng.next() * 3 }));
      for (let y = 0; y < p.h; y++)
        for (let x = 0; x < p.w; x++) {
          const white = spots.some((s) => Math.hypot(x - s.x, y - s.y) < s.r);
          p.set(x, y, white ? (rng.next() < 0.2 ? '#d9d9d9' : '#f2f2f2') : rng.next() < 0.3 ? '#2b221d' : '#3a2d26');
        }
    };
    return {
      name: 'body',
      size: [12, 10, 18],
      pivot: [0, 12, 0],
      from: [-6, 0, -9],
      paint: hide,
      children: [
        {
          name: 'head',
          size: [8, 8, 6],
          pivot: [0, 4, 9],
          from: [-4, -2, 0],
          paint: layer(hide, on(['front'], (_f, p) => {
            p.rect(1, 2, 2, 1, '#1b1b1b');
            p.rect(5, 2, 2, 1, '#1b1b1b');
            p.rect(2, 5, 4, 3, '#cfa9a0');
            p.set(3, 6, '#7a5a52');
            p.set(4, 6, '#7a5a52');
          })),
          children: [
            { name: 'hornL', size: [1, 3, 1], pivot: [-4, 6, 3], from: [-1, 0, -0.5], paint: speck(['#e8e2cf', '#d6cfb8'], 'horn') },
            { name: 'hornR', size: [1, 3, 1], pivot: [4, 6, 3], from: [0, 0, -0.5], paint: speck(['#e8e2cf', '#d6cfb8'], 'horn') },
          ],
        },
        legSpec('leg0', [-4, 0, -6], [4, 12, 4], hide),
        legSpec('leg1', [4, 0, -6], [4, 12, 4], hide),
        legSpec('leg2', [-4, 0, 6], [4, 12, 4], hide),
        legSpec('leg3', [4, 0, 6], [4, 12, 4], hide),
      ],
    };
  },
  sheep: () => {
    const wool = speck(['#f2f2ee', '#e6e6e0', '#fafaf6', '#dcdcd4'], 'wool');
    const face = speck(['#d9c3a8', '#cdb69a'], 'sheepface');
    return {
      name: 'body',
      size: [10, 9, 16],
      pivot: [0, 10, 0],
      from: [-5, 0, -8],
      paint: wool,
      children: [
        {
          name: 'head',
          size: [6, 6, 7],
          pivot: [0, 5, 8],
          from: [-3, -2, -1],
          paint: layer(on(['top', 'left', 'right', 'back'], wool), on(['front', 'bottom'], face), on(['front'], px([[1, 2], [4, 2]], '#1b1b1b')), on(['front'], px([[2, 4], [3, 4]], '#a8846a'))),
        },
        legSpec('leg0', [-3, 0, -5], [4, 10, 4], layer(face, band(0, 3, ['#f2f2ee'], 'sl'))),
        legSpec('leg1', [3, 0, -5], [4, 10, 4], layer(face, band(0, 3, ['#f2f2ee'], 'sl'))),
        legSpec('leg2', [-3, 0, 5], [4, 10, 4], layer(face, band(0, 3, ['#f2f2ee'], 'sl'))),
        legSpec('leg3', [3, 0, 5], [4, 10, 4], layer(face, band(0, 3, ['#f2f2ee'], 'sl'))),
      ],
    };
  },
  chicken: () => {
    const white = speck(['#f7f7f2', '#ececE4'.toLowerCase(), '#ffffff'], 'chicken');
    const yellow = speck(['#e8b23a', '#d9a02c'], 'cleg');
    return {
      name: 'body',
      size: [6, 6, 8],
      pivot: [0, 5, 0],
      from: [-3, 0, -4],
      paint: white,
      children: [
        {
          name: 'head',
          size: [4, 6, 3],
          pivot: [0, 4, 4],
          from: [-2, 0, -1],
          paint: layer(white, on(['front'], px([[0, 1], [3, 1]], '#1b1b1b'))),
          children: [
            { name: 'beak', size: [4, 2, 2], pivot: [0, 2, 2], from: [-2, 0, 0], paint: speck(['#f0a030', '#e08e20'], 'beak') },
            { name: 'wattle', size: [2, 2, 1], pivot: [0, 0, 2], from: [-1, 0, 0], paint: speck(['#d42a2a', '#c21f1f'], 'wattle') },
          ],
        },
        { name: 'wingL', size: [1, 4, 6], pivot: [3, 5, 0], from: [0, -4, -3], paint: white },
        { name: 'wingR', size: [1, 4, 6], pivot: [-3, 5, 0], from: [-1, -4, -3], paint: white },
        legSpec('leg0', [-1.5, 0, 0], [1, 5, 1], yellow),
        legSpec('leg1', [1.5, 0, 0], [1, 5, 1], yellow),
      ],
    };
  },
  bat: () => {
    const fur = speck(['#4a3a2e', '#3d3026', '#56443a'], 'bat');
    const wing: FacePainter = (face, p) => {
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, (x + y) % 4 === 0 ? '#2a201a' : '#3a2c22', y > p.h - 3 && x % 3 === 1 ? 0 : 255);
    };
    return {
      name: 'body',
      size: [6, 6, 6],
      pivot: [0, 0, 0],
      from: [-3, -3, -3],
      paint: layer(fur, on(['front'], px([[1, 2], [4, 2]], '#ffd34d'))),
      cutout: true,
      children: [
        { name: 'ear0', size: [1, 2, 1], pivot: [-2, 3, 0], from: [-0.5, 0, -0.5], paint: fur },
        { name: 'ear1', size: [1, 2, 1], pivot: [2, 3, 0], from: [-0.5, 0, -0.5], paint: fur },
        { name: 'wingL', size: [10, 8, 1], pivot: [3, 2, 0], from: [0, -8, -0.5], paint: wing, cutout: true },
        { name: 'wingR', size: [10, 8, 1], pivot: [-3, 2, 0], from: [-10, -8, -0.5], paint: wing, cutout: true },
      ],
    };
  },
};

/** Lichter für den Nether: Glutgeist und Magmaschleim leuchten selbst */
const EMISSIVE: Partial<Record<MobKind, number>> = { glutgeist: 0.9, magma: 0.6 };

export function buildMob(kind: MobKind): BoxModel {
  return buildBoxModel(SPECS[kind](), { emissive: EMISSIVE[kind] });
}

export const MOB_KINDS = Object.keys(SPECS) as MobKind[];
