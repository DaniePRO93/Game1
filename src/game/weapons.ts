export type WeaponId = 'rifle' | 'shotgun' | 'pistol' | 'sniper' | 'eraser';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  hint: string;
  auto: boolean;
  /** Seconds between shots. */
  interval: number;
  damage: number;
  pellets: number;
  spread: number;
  mag: number;
  /** Starting/max reserve. Infinity for pistol. */
  reserve: number;
  reload: number;
  falloffStart: number;
  falloffEnd: number;
  /** Multiplier vs heavies and the boss. */
  heavyMult: number;
  recoil: number;
  /** Melee: hits everything within `range` m and `arc` rad of center, never uses ammo. */
  melee?: { range: number; arc: number; lunge: number };
}

export const WEAPONS: WeaponDef[] = [
  { id: 'rifle', name: 'RIFLE', hint: 'auto · hold to spray', auto: true, interval: 0.1, damage: 22, pellets: 1, spread: 0.014, mag: 30, reserve: 150, reload: 1.6, falloffStart: 25, falloffEnd: 60, heavyMult: 1, recoil: 0.012 },
  { id: 'shotgun', name: 'SHOTGUN', hint: 'ends heavies', auto: false, interval: 0.85, damage: 14, pellets: 8, spread: 0.075, mag: 6, reserve: 36, reload: 2.0, falloffStart: 6, falloffEnd: 20, heavyMult: 1.75, recoil: 0.06 },
  { id: 'pistol', name: 'PISTOL', hint: 'never runs dry', auto: false, interval: 0.18, damage: 30, pellets: 1, spread: 0.008, mag: 12, reserve: Infinity, reload: 1.1, falloffStart: 20, falloffEnd: 50, heavyMult: 1, recoil: 0.025 },
  { id: 'sniper', name: 'SNIPER', hint: 'right-click to scope', auto: false, interval: 1.1, damage: 120, pellets: 1, spread: 0.05, mag: 5, reserve: 25, reload: 2.4, falloffStart: 200, falloffEnd: 300, heavyMult: 1.25, recoil: 0.09 },
  { id: 'eraser', name: 'ERASER SWORD', hint: 'click to swing · erases doodles', auto: true, interval: 0.42, damage: 100, pellets: 1, spread: 0, mag: Infinity, reserve: Infinity, reload: 0, falloffStart: Infinity, falloffEnd: Infinity, heavyMult: 1, recoil: 0, melee: { range: 3.2, arc: 1.0, lunge: 14 } },
];

export const HEADSHOT_MULT = 2;

/** Linear falloff to 50% between falloffStart and falloffEnd. */
export function damageAt(def: WeaponDef, distance: number): number {
  if (distance <= def.falloffStart) return def.damage;
  if (distance >= def.falloffEnd) return def.damage * 0.5;
  const k = (distance - def.falloffStart) / (def.falloffEnd - def.falloffStart);
  return def.damage * (1 - 0.5 * k);
}

export class WeaponState {
  ammo: number;
  reserve: number;
  cooldown = 0;
  reloading = 0;

  constructor(public def: WeaponDef) {
    this.ammo = def.mag;
    this.reserve = def.reserve;
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.reloading = 0;
        const need = this.def.mag - this.ammo;
        const take = Math.min(need, this.reserve);
        this.ammo += take;
        if (this.reserve !== Infinity) this.reserve -= take;
      }
    }
  }

  canFire(): boolean {
    return this.cooldown <= 0 && this.reloading <= 0 && this.ammo > 0;
  }

  /** Consumes a round. Returns false if it could not fire. */
  fire(): boolean {
    if (!this.canFire()) return false;
    if (!this.def.melee) this.ammo--;
    this.cooldown = this.def.interval;
    return true;
  }

  startReload(): boolean {
    if (this.reloading > 0 || this.ammo >= this.def.mag || this.reserve <= 0) return false;
    this.reloading = this.def.reload;
    return true;
  }

  cancelReload(): void {
    this.reloading = 0;
  }

  addAmmoFraction(f: number): void {
    if (this.def.reserve === Infinity) return;
    this.reserve = Math.min(this.def.reserve, this.reserve + Math.ceil(this.def.reserve * f));
  }
}
