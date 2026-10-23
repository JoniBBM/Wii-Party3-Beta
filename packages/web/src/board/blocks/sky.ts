/**
 * Himmel der Blockwelt: Verlauf von Himmelblau zum hellen Horizont, eckige Sonne und flache
 * Block-Wolken, die langsam über die Insel ziehen.
 */
import * as THREE from 'three';
import type { Sky } from '../sky.ts';

export const BLOCK_SKY = { top: new THREE.Color('#6b98ff'), horizon: new THREE.Color('#bcd4ff') };

export function createBlockSky(sunDir: THREE.Vector3): Sky {
  const group = new THREE.Group();
  group.name = 'block-sky';

  // Himmelskuppel mit Verlauf
  const domeGeo = new THREE.SphereGeometry(480, 32, 16);
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: BLOCK_SKY.top }, horizon: { value: BLOCK_SKY.horizon } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader:
      'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y * 2.2, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, h), 1.0);\n#include <colorspace_fragment>\n}',
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.renderOrder = -10;
  group.add(dome);

  // Eckige Sonne
  const sunGeo = new THREE.PlaneGeometry(36, 36);
  const sunMat = new THREE.MeshBasicMaterial({ color: '#fffbe2', fog: false, depthWrite: false, toneMapped: false });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(56, 56), new THREE.MeshBasicMaterial({ color: '#fff1b0', transparent: true, opacity: 0.35, fog: false, depthWrite: false }));
  const dir = sunDir.clone().normalize();
  sun.position.copy(dir).multiplyScalar(440);
  halo.position.copy(dir).multiplyScalar(441);
  sun.lookAt(0, 0, 0);
  halo.lookAt(0, 0, 0);
  group.add(halo, sun);

  // Block-Wolken: Raster mit Lücken, 1 Block dick
  const cell = 5;
  const span = 64;
  const hash = (x: number, z: number) => {
    const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
    return h - Math.floor(h);
  };
  const smooth = (x: number, z: number) => {
    let s = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) s += hash(Math.floor((x + dx) / 3), Math.floor((z + dz) / 3));
    return s / 9;
  };
  const cloudGeo = new THREE.BoxGeometry(1, 1, 1);
  const cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.55, transparent: true, opacity: 0.86, depthWrite: false });
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, span * span);
  clouds.position.y = 58;
  clouds.renderOrder = 1;
  clouds.frustumCulled = false;
  group.add(clouds);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3(cell, 1.6, cell);
  const v = new THREE.Vector3();
  /** Muster um `shift` Zellen verschoben neu legen – so ziehen die Wolken nahtlos weiter */
  let shown = NaN;
  const fill = (shift: number) => {
    if (shift === shown) return;
    shown = shift;
    let k = 0;
    for (let z = 0; z < span; z++)
      for (let x = 0; x < span; x++) {
        if (smooth(x - shift, z) < 0.62) continue;
        clouds.setMatrixAt(k++, m4.compose(v.set((x - span / 2) * cell, 0, (z - span / 2) * cell), q, sc));
      }
    clouds.count = k;
    clouds.instanceMatrix.needsUpdate = true;
  };
  fill(0);
  const speed = 0.9;

  return {
    group,
    update(t) {
      // gleichmäßig nach Osten ziehen
      const d = t * speed;
      fill(Math.floor(d / cell));
      clouds.position.x = d % cell;
    },
    dispose() {
      domeGeo.dispose();
      domeMat.dispose();
      sunGeo.dispose();
      sunMat.dispose();
      cloudGeo.dispose();
      cloudMat.dispose();
    },
  };
}
