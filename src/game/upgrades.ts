/** Run modifiers changed by upgrades. All start neutral. */
export interface Mods {
  damage: number;
  fireRate: number;
  reload: number;
  reserve: number;
  meterCap: number;
  meterRefill: number;
  maxHp: number;
  healOnKill: number;
  airJumps: number;
  slide: number;
  swordRange: number;
  swatter: boolean;
  inkBomb: number;
  ricochet: boolean;
  comboWindow: number;
  headshot: number;
  moveSpeed: number;
}

export function baseMods(): Mods {
  return {
    damage: 1,
    fireRate: 1,
    reload: 1,
    reserve: 1,
    meterCap: 0,
    meterRefill: 0,
    maxHp: 0,
    healOnKill: 0,
    airJumps: 1,
    slide: 1,
    swordRange: 1,
    swatter: false,
    inkBomb: 0,
    ricochet: false,
    comboWindow: 0,
    headshot: 0,
    moveSpeed: 1,
  };
}

export interface Upgrade {
  id: string;
  name: string;
  text: string;
  /** Sticky-note color (hue 0..1). */
  hue: number;
  max: number;
  apply: (m: Mods) => void;
}

export const UPGRADES: Upgrade[] = [
  { id: 'nib', name: 'Sharper Nib', text: '+20% damage', hue: 0.0, max: 3, apply: (m) => (m.damage += 0.2) },
  { id: 'hands', name: 'Quick Hands', text: 'reload 35% faster', hue: 0.08, max: 2, apply: (m) => (m.reload *= 0.65) },
  { id: 'trigger', name: 'Trigger Happy', text: '+20% fire rate', hue: 0.05, max: 2, apply: (m) => (m.fireRate += 0.2) },
  { id: 'exposure', name: 'Long Exposure', text: 'time bar +2s', hue: 0.58, max: 2, apply: (m) => (m.meterCap += 2) },
  { id: 'thief', name: 'Time Thief', text: 'kills refill +0.5s more time', hue: 0.55, max: 2, apply: (m) => (m.meterRefill += 0.5) },
  { id: 'paper', name: 'Thick Paper', text: '+25 max HP', hue: 0.33, max: 3, apply: (m) => (m.maxHp += 25) },
  { id: 'papercut', name: 'Papercut', text: 'kills heal 5 HP', hue: 0.38, max: 2, apply: (m) => (m.healOnKill += 5) },
  { id: 'jump', name: 'Pen Flick', text: '+1 air jump', hue: 0.14, max: 1, apply: (m) => (m.airJumps += 1) },
  { id: 'slide', name: 'Greased Slide', text: 'slides 40% faster & longer', hue: 0.17, max: 2, apply: (m) => (m.slide += 0.4) },
  { id: 'eraser', name: 'Big Eraser', text: 'sword reach +40%', hue: 0.92, max: 2, apply: (m) => (m.swordRange += 0.4) },
  { id: 'swatter', name: 'Swatter', text: 'sword swings erase bullets', hue: 0.88, max: 1, apply: (m) => (m.swatter = true) },
  { id: 'bomb', name: 'Ink Bomb', text: 'kills splash 40 dmg nearby', hue: 0.72, max: 2, apply: (m) => (m.inkBomb += 40) },
  { id: 'ricochet', name: 'Ricochet', text: 'missed shots bounce to a nearby enemy', hue: 0.78, max: 1, apply: (m) => (m.ricochet = true) },
  { id: 'keeper', name: 'Combo Keeper', text: 'combo window +1.5s', hue: 0.66, max: 2, apply: (m) => (m.comboWindow += 1.5) },
  { id: 'head', name: 'Headhunter', text: 'headshots +75% damage', hue: 0.02, max: 1, apply: (m) => (m.headshot += 0.75) },
  { id: 'pockets', name: 'Deep Pockets', text: '+50% max ammo', hue: 0.45, max: 2, apply: (m) => (m.reserve += 0.5) },
  { id: 'sneakers', name: 'Doodle Sneakers', text: '+12% move speed', hue: 0.25, max: 2, apply: (m) => (m.moveSpeed += 0.12) },
];

/** Pick `n` distinct upgrades the player hasn't maxed. */
export function rollUpgrades(owned: Record<string, number>, n: number, rand: () => number = Math.random): Upgrade[] {
  const pool = UPGRADES.filter((u) => (owned[u.id] ?? 0) < u.max);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/** God Pen cheat: every upgrade at its max level. */
export function maxedUpgrades(): Record<string, number> {
  return Object.fromEntries(UPGRADES.map((u) => [u.id, u.max]));
}

export function modsFrom(owned: Record<string, number>): Mods {
  const m = baseMods();
  for (const u of UPGRADES) for (let i = 0; i < (owned[u.id] ?? 0); i++) u.apply(m);
  return m;
}
