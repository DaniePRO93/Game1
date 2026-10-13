/** Keyboard/mouse state with pointer lock. */
export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  mouseDown = false;
  mouseClicked = false;
  rightDown = false;
  dx = 0;
  dy = 0;
  wheel = 0;
  locked = false;
  onLockChange: (locked: boolean) => void = () => {};

  constructor(private el: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (this.locked && ['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = this.rightDown = false;
    });
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
    const p = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
    p?.catch?.(() => {});
  }

  unlock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Clear per-frame edge state. */
  endFrame(): void {
    this.pressed.clear();
    this.mouseClicked = false;
    this.dx = this.dy = 0;
    this.wheel = 0;
  }
}
