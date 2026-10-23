// Gemeinsame Prüfung für die Browser-Tests (läuft im Browser per page.evaluate).

/** Im Browser: Text, der aus seinem Kasten ragt, und seitliches Scrollen der Seite finden. */
export function audit() {
  const vw = document.documentElement.clientWidth;
  const res = [];
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p);
      if (/(hidden|auto|scroll|clip)/.test(o.overflowX)) return true;
    }
    return false;
  };
  // absichtlich überstehende Abzeichen (z. B. Stift am Team-Bild) zählen nicht
  const byAbsolute = (el, r) =>
    [...el.querySelectorAll('*')].some((d) => {
      if (!/(absolute|fixed)/.test(getComputedStyle(d).position)) return false;
      const dr = d.getBoundingClientRect();
      return dr.right > r.right + 1 || dr.bottom > r.bottom + 1 || dr.left < r.left - 1;
    });
  const label = (el) => (el.innerText || el.getAttribute('aria-label') || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 50);
  if (document.documentElement.scrollWidth > vw + 1) res.push({ kind: 'seite-scrollt', text: `${document.documentElement.scrollWidth}px statt ${vw}px` });
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg, canvas, [data-noaudit]')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // Text ragt aus seinem eigenen Kasten (sichtbar, nicht absichtlich gekürzt)
    if (cs.overflowX === 'visible' && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && cs.textOverflow !== 'ellipsis' && !clipped(el) && !byAbsolute(el, r)) {
      const kidsOver = [...el.children].some((c) => c.scrollWidth > c.clientWidth + 2 && getComputedStyle(c).overflowX === 'visible');
      if (!kidsOver) res.push({ kind: 'text-ragt-raus', text: label(el), detail: `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 5).join('.')} ${el.scrollWidth}>${el.clientWidth}` });
    }
    // Text läuft unten aus einem Kasten fester Höhe (z. B. Knopf mit zweizeiliger Beschriftung)
    if (cs.overflowY === 'visible' && el.scrollHeight > el.clientHeight + 3 && el.clientHeight > 0 && cs.height !== 'auto' && !clipped(el) && !byAbsolute(el, r)) {
      const kidsOver = [...el.children].some((c) => c.scrollHeight > c.clientHeight + 3 && getComputedStyle(c).overflowY === 'visible');
      // reine Emojis sind bauartbedingt etwas höher als ihre Zeile – kein Fehler
      if (!kidsOver && /[\p{L}\p{N}]/u.test(el.innerText ?? '')) res.push({ kind: 'text-unten-raus', text: label(el), detail: `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 5).join('.')} ${el.scrollHeight}>${el.clientHeight}` });
    }
    // Element ragt seitlich aus dem Bildschirm
    if ((r.right > vw + 1 || r.left < -1) && !clipped(el) && cs.position !== 'fixed') {
      const kids = [...el.children].some((c) => {
        const cr = c.getBoundingClientRect();
        return cr.width > 0 && (cr.right > vw + 1 || cr.left < -1);
      });
      if (!kids) res.push({ kind: 'ausserhalb', text: label(el), detail: `${Math.round(r.left)}…${Math.round(r.right)} / ${vw}` });
    }
  }
  return res;
}
