export type WeaponId = 'rifle' | 'shotgun' | 'pistol' | 'sniper' | 'eraser' | 'minigun' | 'railgun';

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
  /** Headshot multiplier for this gun (default HEADSHOT_MULT). */
  headMult?: number;
  /** Extra targets a shot passes through. */
  pierce?: number;
  /** Seconds of holding the trigger before it fires (minigun). */
  spinUp?: number;
  /** Paint colors (hues 0..1) it splashes, from the gun's own colors. */
  paint: number[];
  /** Melee: hits everything within `range` m and `arc` rad of center, never uses ammo. */
  melee?: { range: number; arc: number; lunge: number };
}

export const WEAPONS: WeaponDef[] = [
  { id: 'rifle', name: 'RIFLE', hint: 'auto · hold to spray', auto: true, interval: 0.1, damage: 22, pellets: 1, spread: 0.014, mag: 30, reserve: 150, reload: 1.6, falloffStart: 25, falloffEnd: 60, heavyMult: 1, recoil: 0.012, paint: [0.07, 0.5, 0.14] },
  { id: 'shotgun', name: 'SHOTGUN', hint: 'ends heavies · aim to tighten', auto: false, interval: 0.7, damage: 18, pellets: 8, spread: 0.06, mag: 7, reserve: 42, reload: 1.8, falloffStart: 9, falloffEnd: 26, heavyMult: 1.75, recoil: 0.06, paint: [0.0, 0.13, 0.48] },
  { id: 'pistol', name: 'PISTOL', hint: 'never runs dry', auto: false, interval: 0.18, damage: 30, pellets: 1, spread: 0.008, mag: 12, reserve: Infinity, reload: 1.1, falloffStart: 20, falloffEnd: 50, heavyMult: 1, recoil: 0.025, paint: [0.33, 0.78] },
  // Body shots no longer one-shot everything; headshots (×3) and a pierce reward precision.
  { id: 'sniper', name: 'SNIPER', hint: 'aim to scope · headshots ×3 · pierces one', auto: false, interval: 1.2, damage: 95, pellets: 1, spread: 0.05, mag: 5, reserve: 25, reload: 2.4, falloffStart: 200, falloffEnd: 300, heavyMult: 1.25, recoil: 0.09, headMult: 3, pierce: 1, paint: [0.75, 0.55, 0.92] },
  { id: 'eraser', name: 'ERASER SWORD', hint: 'click to swing · erases doodles', auto: true, interval: 0.42, damage: 100, pellets: 1, spread: 0, mag: Infinity, reserve: Infinity, reload: 0, falloffStart: Infinity, falloffEnd: Infinity, heavyMult: 1, recoil: 0, melee: { range: 3.2, arc: 1.0, lunge: 14 }, paint: [0.95, 0.14] },
];

/** Killstreak rewards: temporary, limited ammo, no reload. */
export const MINIGUN: WeaponDef = { id: 'minigun', name: 'MINIGUN', hint: 'killstreak! hold to spin up and shred', auto: true, interval: 0.05, damage: 13, pellets: 1, spread: 0.035, mag: 200, reserve: 0, reload: 0, falloffStart: 20, falloffEnd: 50, heavyMult: 1.2, recoil: 0.005, spinUp: 0.35, paint: [0.02, 0.1, 0.16] };
export const RAILGUN: WeaponDef = { id: 'railgun', name: 'RAILGUN', hint: 'killstreak! pierces everything in line', auto: false, interval: 0.9, damage: 300, pellets: 1, spread: 0.004, mag: 6, reserve: 0, reload: 0, falloffStart: Infinity, falloffEnd: Infinity, heavyMult: 1.5, recoil: 0.1, pierce: 99, paint: [0.52, 0.6, 0.85] };
export const STREAKS: { kills: number; def: WeaponDef }[] = [
  { kills: 3, def: MINIGUN },
  { kills: 5, def: RAILGUN },
];
/** Every gun, for sending a weapon over the network by index. */
export const ALL_WEAPONS: WeaponDef[] = [...WEAPONS, MINIGUN, RAILGUN];

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

  /** Run modifiers from upgrades. */
  rateMult = 1;
  reloadMult = 1;
  reserveMult = 1;

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
    this.cooldown = this.def.interval / this.rateMult;
    return true;
  }

  startReload(): boolean {
    if (this.reloading > 0 || this.ammo >= this.def.mag || this.reserve <= 0) return false;
    this.reloading = this.def.reload * this.reloadMult;
    return true;
  }

  cancelReload(): void {
    this.reloading = 0;
  }

  get maxReserve(): number {
    return this.def.reserve * this.reserveMult;
  }

  addAmmoFraction(f: number): void {
    if (this.def.reserve === Infinity) return;
    this.reserve = Math.min(this.maxReserve, this.reserve + Math.ceil(this.def.reserve * f));
  }

  /** Raise ammo capacity, granting the newly added room as ammo. */
  setReserveMult(m: number): void {
    if (this.def.reserve === Infinity || m <= this.reserveMult) return;
    const gain = this.def.reserve * (m - this.reserveMult);
    this.reserveMult = m;
    this.reserve = Math.min(this.maxReserve, this.reserve + Math.ceil(gain));
  }
}
