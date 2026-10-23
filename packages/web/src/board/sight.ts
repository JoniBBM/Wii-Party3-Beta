/**
 * Was sieht die Kamera gerade? Für Tiere, Mobs und Kurzauftritte: Auftauchen, Verschwinden und
 * Versetzen nur dort, wo gerade niemand hinschaut (außerhalb des Bildes mit etwas Rand oder weit weg).
 */
import * as THREE from 'three';

export class CameraSight {
  /** Kameraposition (Welt) */
  readonly cam = new THREE.Vector3();
  private frustum = new THREE.Frustum();
  private pv = new THREE.Matrix4();
  private sphere = new THREE.Sphere();

  /** Einmal je Bild mit der aktuellen Kamera aufrufen. */
  update(camera: THREE.Camera) {
    camera.updateMatrixWorld();
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    camera.getWorldPosition(this.cam);
  }

  /** Berührt eine Kugel um `p` das Sichtfeld (ohne Entfernungsgrenze)? */
  inFrustum(p: THREE.Vector3, radius: number) {
    this.sphere.center.copy(p);
    this.sphere.radius = radius;
    return this.frustum.intersectsSphere(this.sphere);
  }

  /**
   * Ist die Stelle im Bild zu sehen? Großzügig: Kugel `radius` plus `margin` Rand (die Kamera
   * bewegt sich weiter), bis `range` Meter Entfernung – dahinter ist ein Tier nur noch ein Punkt.
   */
  sees(p: THREE.Vector3, radius = 1, margin = 2.5, range = 120) {
    if (p.distanceToSquared(this.cam) > range * range) return false;
    return this.inFrustum(p, radius + margin);
  }
}
