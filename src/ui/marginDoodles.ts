import { DOODLES } from '../draw/doodles';
import { PAD_H, PAD_W, paintStrokes } from '../draw/drawPad';

export interface DoodlePlacement {
  /** Doodle id from draw/doodles.ts. */
  id: string;
  /** Inline position, e.g. { top: '40px', left: '-150px' }. */
  pos: Partial<Record<'top' | 'left' | 'right' | 'bottom', string>>;
  /** Height in CSS px. */
  size: number;
  /** Rotation in degrees. */
  rot?: number;
  /** Extra class: 'note' (taped sticky note), 'gutter' (only on wide screens), 'inner'. */
  cls?: string;
  /** Show the doodle's name underneath in handwriting. */
  label?: boolean;
  ink?: string;
}

/**
 * Sketch example doodles into a page's margins, like a notebook someone drew
 * in during class. Purely decorative (aria-hidden, no pointer events).
 */
export function placeDoodles(host: HTMLElement, items: DoodlePlacement[]): void {
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  for (const it of items) {
    const d = DOODLES.find((x) => x.id === it.id);
    if (!d) continue;
    const wrap = document.createElement('div');
    wrap.className = `margin-doodle ${it.cls ?? ''}`;
    wrap.setAttribute('aria-hidden', 'true');
    Object.assign(wrap.style, it.pos);
    wrap.style.setProperty('--rot', `${it.rot ?? 0}deg`);
    const h = it.size;
    const w = Math.round((h * PAD_W) / PAD_H);
    const cv = document.createElement('canvas');
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    paintStrokes(cv.getContext('2d')!, d.strokes(), (h * dpr) / PAD_H, it.ink ?? '#2a2e85');
    wrap.append(cv);
    if (it.label) {
      const l = document.createElement('div');
      l.className = 'margin-doodle-label';
      l.textContent = d.name;
      wrap.append(l);
    }
    host.append(wrap);
  }
}
