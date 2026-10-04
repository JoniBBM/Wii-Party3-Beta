/** Mini-Tween-System, getaktet über die Render-Schleife (pausiert mit dem Tab). */

export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  in: (t: number) => t * t * t,
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outBounce: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

interface Tween {
  elapsed: number;
  duration: number;
  fn: (t: number) => void;
  ease: Ease;
  resolve: () => void;
}

export class Tweens {
  private list: Tween[] = [];
  /** Zeitraffer, z. B. wenn sich Animationen stauen. */
  speed = 1;

  run(duration: number, fn: (t: number) => void, e: Ease = ease.inOut): Promise<void> {
    return new Promise((resolve) => {
      if (duration <= 0) {
        fn(1);
        resolve();
        return;
      }
      this.list.push({ elapsed: 0, duration, fn, ease: e, resolve });
    });
  }

  wait(ms: number): Promise<void> {
    return this.run(ms / 1000, () => {}, ease.linear);
  }

  update(dt: number) {
    const done: Tween[] = [];
    for (const tw of this.list) {
      tw.elapsed += dt * this.speed;
      const t = Math.min(1, tw.elapsed / tw.duration);
      tw.fn(tw.ease(t));
      if (t >= 1) done.push(tw);
    }
    if (done.length) {
      this.list = this.list.filter((t) => !done.includes(t));
      for (const t of done) t.resolve();
    }
  }

  /** Alles sofort beenden (z. B. bei Rückgängig). */
  finishAll() {
    for (const tw of this.list) {
      tw.fn(1);
      tw.resolve();
    }
    this.list = [];
  }
}
