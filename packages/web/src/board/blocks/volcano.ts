/**
 * Vulkan der Blockwelt: Lava im Krater (Teil des Geländes), eckiger Rauch je nach Druck, Glutlicht
 * und beim Ausbruch fliegende Lava- und Magmablöcke.
 */
import * as THREE from 'three';
import { VOLCANO } from '@insel/shared';
import type { Effects } from '../particles.ts';
import type { VolcanoFx } from '../volcano.ts';
import { blockAtlas } from './atlas.ts';
import { BLOCK } from './world.ts';

interface Flying {
  mesh: THREE.Mesh;
  v: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
}

export function buildBlockVolcano(effects: Effects, lavaY: number): VolcanoFx {
  const group = new THREE.Group();
  group.name = 'block-volcano';
  const top = new THREE.Vector3(VOLCANO.x, lavaY + 0.3, VOLCANO.z);
  const light = new THREE.PointLight('#ff7a1f', 18, 26, 1.6);
  light.position.set(VOLCANO.x, lavaY + 2.5, VOLCANO.z);
  group.add(light);

  // fliegende Blöcke (Lava/Magma), wiederverwendet
  const atlas = blockAtlas();
  const blockGeo = (tile: string) => {
    const g = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    const [u0, v0, u1, v1] = atlas.uv(tile);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
    return g;
  };
  const geos = [blockGeo('magma'), blockGeo('lava'), blockGeo('obsidian')];
  const mats = [
    new THREE.MeshBasicMaterial({ map: atlas.texture }),
    new THREE.MeshBasicMaterial({ map: atlas.texture, color: '#ffffff' }),
    new THREE.MeshLambertMaterial({ map: atlas.texture }),
  ];
  const flying: Flying[] = [];
  let pressure = 0;
  let smokeAcc = 0;

  return {
    group,
    craterTop: top,
    setPressure(p) {
      pressure = Math.max(0, Math.min(1, p));
    },
    update(t, dt) {
      light.intensity = 14 + pressure * 30 + Math.sin(t * 3) * 3;
      smokeAcc += dt * (0.6 + pressure * 4);
      while (smokeAcc > 1) {
        smokeAcc -= 1;
        effects.volcanoSmoke(top.x, top.y + 0.5, top.z, pressure);
      }
      for (let i = flying.length - 1; i >= 0; i--) {
        const f = flying[i]!;
        f.life -= dt;
        f.v.y -= 9.8 * dt;
        f.mesh.position.addScaledVector(f.v, dt);
        f.mesh.rotation.x += f.spin.x * dt;
        f.mesh.rotation.y += f.spin.y * dt;
        if (f.life <= 0 || f.mesh.position.y < -2) {
          if (f.life > -1) effects.dust(f.mesh.position.x, f.mesh.position.y, f.mesh.position.z, new THREE.Color('#5a2a14'), 6);
          f.mesh.removeFromParent();
          flying.splice(i, 1);
        }
      }
    },
    erupt() {
      effects.eruption(top.x, top.y + 1, top.z);
      for (let i = 0; i < 26; i++) {
        const k = i % 3;
        const mesh = new THREE.Mesh(geos[k]!, mats[k]!);
        mesh.position.copy(top).add(new THREE.Vector3((Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2));
        const a = Math.random() * Math.PI * 2;
        const s = 3 + Math.random() * 7;
        group.add(mesh);
        flying.push({ mesh, v: new THREE.Vector3(Math.cos(a) * s, 9 + Math.random() * 10, Math.sin(a) * s), spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, 0), life: 2.4 + Math.random() * 1.4 });
      }
    },
  };
}
