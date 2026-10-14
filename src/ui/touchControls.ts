import type { Input } from '../game/input';
import { TOUCH_LOOK_SCALE, stickVector } from './stick';

/** How far (px) the thumb has to travel for full speed. */
const STICK_RADIUS = 56;

/** Buttons that press a key while held (the game reads them like the keyboard). */
const KEY_BUTTONS: Record<string, string> = {
  jump: 'Space',
  slide: 'KeyC',
  reload: 'KeyR',
  swap: 'KeyQ',
  slow: 'ShiftLeft',
};

/**
 * On-screen controls for phones: a floating stick under the left thumb, drag
 * anywhere on the right to look, and thumb buttons. Everything is written
 * into `Input`, so the game can't tell it from a keyboard and mouse.
 *
 * FIRE doubles as a look pad (drag while holding it), so you can aim and
 * shoot at the same time. AIM is a toggle since holding it would tie up a thumb.
 */
export class TouchControls {
  /** Look speed multiplier from Options. */
  lookSpeed = 1;
  private movePointer: number | null = null;
  private moveOrigin = { x: 0, y: 0 };
  /** Pointers that turn the camera (look zone and FIRE), with their last position. */
  private lookers = new Map<number, { x: number; y: number }>();
  private base: HTMLElement;
  private knob: HTMLElement;
  private aimBtn: HTMLElement;

  constructor(
    private root: HTMLElement,
    private input: Input,
    onPause: () => void,
  ) {
    root.style.display = '';
    document.body.classList.add('touch');
    this.base = root.querySelector('.t-stick')!;
    this.knob = root.querySelector('.t-knob')!;
    this.aimBtn = root.querySelector('[data-t="aim"]')!;

    const moveZone = root.querySelector<HTMLElement>('.t-move')!;
    moveZone.addEventListener('pointerdown', (e) => {
      if (this.movePointer !== null) return;
      this.capture(moveZone, e);
      this.movePointer = e.pointerId;
      this.moveOrigin = { x: e.clientX, y: e.clientY };
      this.base.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.base.classList.add('on');
      this.setStick(0, 0);
    });
    moveZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.movePointer) return;
      this.setStick(e.clientX - this.moveOrigin.x, e.clientY - this.moveOrigin.y);
    });
    const endMove = (e: PointerEvent) => {
      if (e.pointerId !== this.movePointer) return;
      this.movePointer = null;
      this.base.classList.remove('on');
      this.input.moveX = this.input.moveY = 0;
    };
    moveZone.addEventListener('pointerup', endMove);
    moveZone.addEventListener('pointercancel', endMove);

    const lookZone = root.querySelector<HTMLElement>('.t-look')!;
    this.lookPad(lookZone);

    for (const btn of Array.from(root.querySelectorAll<HTMLElement>('[data-t]'))) {
      const id = btn.dataset.t!;
      btn.addEventListener('pointerdown', (e) => {
        this.capture(btn, e);
        e.stopPropagation();
        btn.classList.add('down');
        const key = KEY_BUTTONS[id];
        if (key) {
          if (!this.input.keys.has(key)) this.input.pressed.add(key);
          this.input.keys.add(key);
        } else if (id === 'fire') {
          this.input.mouseDown = true;
          this.input.mouseClicked = true;
        } else if (id === 'aim') {
          this.setAim(!this.input.rightDown);
        } else if (id === 'pause') {
          onPause();
        }
      });
      const up = (e: PointerEvent) => {
        btn.classList.remove('down');
        const key = KEY_BUTTONS[id];
        if (key) this.input.keys.delete(key);
        else if (id === 'fire') this.input.mouseDown = false;
        this.lookers.delete(e.pointerId);
      };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
    }
    this.lookPad(root.querySelector<HTMLElement>('[data-t="fire"]')!);
  }

  /** Drags on `el` turn the camera. */
  private lookPad(el: HTMLElement): void {
    el.addEventListener('pointerdown', (e) => {
      this.capture(el, e);
      this.lookers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    el.addEventListener('pointermove', (e) => {
      const last = this.lookers.get(e.pointerId);
      if (!last) return;
      const k = TOUCH_LOOK_SCALE * this.lookSpeed;
      this.input.dx += (e.clientX - last.x) * k;
      this.input.dy += (e.clientY - last.y) * k;
      last.x = e.clientX;
      last.y = e.clientY;
    });
    const end = (e: PointerEvent) => this.lookers.delete(e.pointerId);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  private capture(el: HTMLElement, e: PointerEvent): void {
    e.preventDefault();
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events in tests have no capturable pointer */
    }
  }

  private setStick(dx: number, dy: number): void {
    const v = stickVector(dx, dy, STICK_RADIUS);
    this.input.moveX = v.x;
    this.input.moveY = v.y;
    const d = Math.hypot(dx, dy);
    const k = d > STICK_RADIUS ? STICK_RADIUS / d : 1;
    this.knob.style.transform = `translate(${(dx * k).toFixed(1)}px, ${(dy * k).toFixed(1)}px)`;
  }

  private setAim(on: boolean): void {
    this.input.rightDown = on;
    this.aimBtn.classList.toggle('on', on);
  }

  /** Let go of everything (pause, death, back to the menu) so nothing stays held. */
  reset(): void {
    this.movePointer = null;
    this.lookers.clear();
    this.base.classList.remove('on');
    this.setAim(false);
    this.input.releaseAll();
    for (const b of Array.from(this.root.querySelectorAll('.down'))) b.classList.remove('down');
  }
}
