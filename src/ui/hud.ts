import { WEAPONS, WeaponId } from '../game/weapons';

export interface HudState {
  score: number;
  wave: number;
  enemiesLeft: number;
  hp: number;
  maxHp: number;
  ammo: number;
  mag: number;
  reserve: number;
  weapon: WeaponId;
  reloading: boolean;
  meter: number;
  slowActive: boolean;
  boss: { name: string; frac: number } | null;
  zoomed: boolean;
}

const $ = (id: string) => document.getElementById(id)!;

/** DOM HUD. Elements live in index.html; this only updates them. */
export class Hud {
  private el = {
    root: $('hud'),
    score: $('hud-score'),
    wave: $('hud-wave'),
    left: $('hud-left'),
    hpFill: $('hud-hp-fill'),
    hpNum: $('hud-hp-num'),
    ammo: $('hud-ammo'),
    pips: $('hud-pips'),
    weaponList: $('hud-weapons'),
    weaponName: $('hud-weapon-name'),
    weaponHint: $('hud-weapon-hint'),
    meterFill: $('hud-meter-fill'),
    meter: $('hud-meter'),
    boss: $('hud-boss'),
    bossName: $('hud-boss-name'),
    bossFill: $('hud-boss-fill'),
    hint: $('hud-hint'),
    banner: $('hud-banner'),
    hitmark: $('hud-hitmark'),
    scope: $('hud-scope'),
    crosshair: $('hud-crosshair'),
  };
  private last = '';
  private hintTimer = 0;
  private bannerTimer = 0;
  private hitTimer = 0;

  constructor() {
    this.el.weaponList.innerHTML = WEAPONS.map(
      (w, i) => `<div class="w" data-id="${w.id}"><span>${i + 1}</span> ${w.name}</div>`,
    ).join('');
  }

  show(v: boolean): void {
    this.el.root.style.display = v ? '' : 'none';
  }

  hint(text: string, seconds = 4): void {
    this.el.hint.textContent = text;
    this.el.hint.style.opacity = '1';
    this.hintTimer = seconds;
  }

  banner(text: string, seconds = 2.2): void {
    this.el.banner.textContent = text;
    this.el.banner.classList.remove('pop');
    void this.el.banner.offsetWidth;
    this.el.banner.classList.add('pop');
    this.el.banner.style.opacity = '1';
    this.bannerTimer = seconds;
  }

  hitmarker(head: boolean, kill: boolean): void {
    this.el.hitmark.className = `on${head ? ' head' : ''}${kill ? ' kill' : ''}`;
    this.hitTimer = kill ? 0.25 : 0.12;
  }

  tick(realDt: number): void {
    if (this.hintTimer > 0) {
      this.hintTimer -= realDt;
      if (this.hintTimer <= 0) this.el.hint.style.opacity = '0';
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= realDt;
      if (this.bannerTimer <= 0) this.el.banner.style.opacity = '0';
    }
    if (this.hitTimer > 0) {
      this.hitTimer -= realDt;
      if (this.hitTimer <= 0) this.el.hitmark.className = '';
    }
  }

  update(s: HudState): void {
    // Cheap change detection to avoid DOM churn every frame.
    const key = JSON.stringify(s);
    if (key === this.last) return;
    this.last = key;
    const e = this.el;
    e.score.textContent = `SCORE ${s.score}`;
    e.wave.textContent = `WAVE ${s.wave}`;
    e.left.textContent = `${s.enemiesLeft} ${s.enemiesLeft === 1 ? 'enemy' : 'enemies'} left`;
    e.hpFill.style.width = `${Math.max(0, (s.hp / s.maxHp) * 100)}%`;
    e.hpFill.classList.toggle('low', s.hp < 30);
    e.hpNum.textContent = `${Math.max(0, Math.ceil(s.hp))}`;
    const reserve = s.reserve === Infinity ? '∞' : `${s.reserve}`;
    e.ammo.innerHTML = s.reloading ? `<span class="reloading">reloading…</span>` : `<b>${s.ammo}</b>/${reserve}`;
    const pipCount = Math.min(s.mag, 30);
    const filled = Math.round((s.ammo / s.mag) * pipCount);
    let pips = '';
    for (let i = 0; i < pipCount; i++) pips += `<i class="${i < filled ? 'f' : ''}"></i>`;
    e.pips.innerHTML = pips;
    for (const el of Array.from(e.weaponList.children) as HTMLElement[]) {
      el.classList.toggle('active', el.dataset.id === s.weapon);
    }
    const def = WEAPONS.find((w) => w.id === s.weapon)!;
    e.weaponName.textContent = def.name;
    e.weaponHint.textContent = def.hint;
    e.meterFill.style.width = `${s.meter * 100}%`;
    e.meter.classList.toggle('active', s.slowActive);
    e.meter.classList.toggle('empty', s.meter < 0.05);
    if (s.boss) {
      e.boss.style.display = '';
      e.bossName.textContent = s.boss.name;
      e.bossFill.style.width = `${Math.max(0, s.boss.frac * 100)}%`;
    } else {
      e.boss.style.display = 'none';
    }
    e.scope.style.display = s.zoomed ? '' : 'none';
    e.crosshair.style.display = s.zoomed ? 'none' : '';
  }
}
