/**
 * Himmel und Ferne: Farbverlauf mit Sonnenglanz (passt nahtlos zum Dunst über dem Meer),
 * ziehende Haufenwolken aus weichen Bällchen und blaue Nachbarinseln am Horizont.
 */
import * as THREE from 'three';
import { rand } from './noise.ts';

export interface Sky {
  group: THREE.Group;
  update: (t: number, dt: number) => void;
  dispose: () => void;
}

function puffTexture(): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  // weiches Bällchen, unten leicht grau-blau (wirkt beleuchtet)
  const grd = g.createRadialGradient(s * 0.5, s * 0.42, s * 0.05, s * 0.5, s * 0.5, s * 0.5);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.55, 'rgba(250,252,255,0.92)');
  grd.addColorStop(1, 'rgba(235,242,250,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  const shade = g.createLinearGradient(0, s * 0.35, 0, s);
  shade.addColorStop(0, 'rgba(160,180,205,0)');
  shade.addColorStop(1, 'rgba(160,180,205,0.55)');
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = shade;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSky(opts: { horizon: THREE.Color; sunDir: THREE.Vector3; clouds: number }): Sky {
  const group = new THREE.Group();
  group.name = 'sky';

  // Himmelskuppel
  const domeGeo = new THREE.SphereGeometry(900, 48, 24);
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color('#2f86de') },
      uHorizon: { value: opts.horizon.clone() },
      uSunDir: { value: opts.sunDir.clone().normalize() },
      uSunColor: { value: new THREE.Color('#fff1cf') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
        vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(uHorizon, uZenith, pow(smoothstep(0.0, 1.0, h), 0.6));
        float sun = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunColor * (pow(sun, 900.0) * 6.0 + pow(sun, 24.0) * 0.28 + pow(sun, 4.0) * 0.06);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);

  // Haufenwolken
  const R = rand(777);
  const tex = puffTexture();
  const cloudMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true, color: '#ffffff' });
  const clouds = new THREE.Group();
  for (let c = 0; c < opts.clouds; c++) {
    const cloud = new THREE.Group();
    const a = (c / opts.clouds) * Math.PI * 2 + R() * 0.4;
    const r = 110 + R() * 170;
    cloud.position.set(Math.cos(a) * r, 52 + R() * 34, Math.sin(a) * r);
    const puffs = 6 + Math.floor(R() * 7);
    const size = 10 + R() * 12;
    for (let i = 0; i < puffs; i++) {
      const sp = new THREE.Sprite(cloudMat);
      const u = (i / (puffs - 1) - 0.5) * 2;
      const s = size * (0.7 + (1 - Math.abs(u)) * 0.7 + R() * 0.3);
      sp.position.set(u * size * 1.6 + (R() - 0.5) * 4, (1 - Math.abs(u)) * size * 0.35 + R() * 3, (R() - 0.5) * size * 0.8);
      sp.scale.set(s, s * 0.82, 1);
      cloud.add(sp);
    }
    clouds.add(cloud);
  }
  group.add(clouds);

  // Nachbarinseln am Horizont (im Dunst bläulich)
  const islandMat = new THREE.MeshStandardMaterial({ color: '#5f8f6a', roughness: 1, flatShading: true });
  const sandMat = new THREE.MeshStandardMaterial({ color: '#d9c08a', roughness: 1 });
  const spots = [
    [-260, -210, 26, 16],
    [300, -150, 34, 22],
    [-330, 90, 22, 10],
    [210, 280, 18, 9],
    [40, -360, 40, 28],
  ] as const;
  for (const [x, z, w, h] of spots) {
    const g = new THREE.Group();
    const hill = new THREE.Mesh(new THREE.ConeGeometry(w, h, 9, 3), islandMat);
    const pos = hill.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > -h / 2 + 0.01 && y < h / 2 - 0.01) pos.setX(i, pos.getX(i) * (0.8 + R() * 0.4));
    }
    hill.geometry.computeVertexNormals();
    hill.position.y = h / 2 - 1;
    hill.scale.set(1.6, 1, 1);
    const beach = new THREE.Mesh(new THREE.CylinderGeometry(w * 1.75, w * 1.9, 1.2, 18), sandMat);
    beach.position.y = -0.3;
    g.add(hill, beach);
    g.position.set(x, 0, z);
    g.rotation.y = R() * Math.PI;
    group.add(g);
  }

  return {
    group,
    update(_t, dt) {
      clouds.rotation.y += dt * 0.0035;
    },
    dispose() {
      tex.dispose();
      domeGeo.dispose();
      domeMat.dispose();
      cloudMat.dispose();
    },
  };
}
