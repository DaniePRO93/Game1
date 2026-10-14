/** Phones and tablets: no pointer lock, the on-screen controls drive this instead. `?touch` forces it for testing. */
export const IS_TOUCH = typeof matchMedia === 'function' && (matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch'));

/**
 * Keyboard/mouse state with pointer lock. On touch devices the on-screen
 * controls (ui/touchControls.ts) write into the same fields, and "lock"
 * just means "playing".
 */
export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  mouseDown = false;
  mouseClicked = false;
  rightDown = false;
  dx = 0;
  dy = 0;
  wheel = 0;
  /** Analog move from the touch stick (-1..1; y + = backward). Keys win when both are used. */
  moveX = 0;
  moveY = 0;
  locked = false;
  onLockChange: (locked: boolean) => void = () => {};

  constructor(private el: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (this.locked && ['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.releaseAll());
    el.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
      }
      if (e.button === 2) this.rightDown = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightDown = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    addEventListener('wheel', (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      if (!this.locked) this.mouseDown = this.rightDown = false;
      this.onLockChange(this.locked);
    });
  }

  lock(): void {
    if (IS_TOUCH) {
      // Called from a tap, so fullscreen + landscape are allowed here (best effort: iPhones say no).
      const root = document.documentElement;
      if (!document.fullscreenElement && root.requestFullscreen) {
        root
          .requestFullscreen({ navigationUI: 'hide' })
          .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
          .catch(() => {});
      }
      this.setTouchLocked(true);
      return;
    }
    const p = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
    p?.catch?.(() => {});
  }

  unlock(): void {
    if (IS_TOUCH) {
      this.setTouchLocked(false);
      return;
    }
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private setTouchLocked(on: boolean): void {
    if (this.locked === on) return;
    this.locked = on;
    if (!on) this.releaseAll();
    this.onLockChange(on);
  }

  /** Let go of everything held (pause, blur, controls hidden). */
  releaseAll(): void {
    this.keys.clear();
    this.mouseDown = this.rightDown = false;
    this.moveX = this.moveY = 0;
  }

  /** Clear per-frame edge state. */
  endFrame(): void {
    this.pressed.clear();
    this.mouseClicked = false;
    this.dx = this.dy = 0;
    this.wheel = 0;
  }
}
