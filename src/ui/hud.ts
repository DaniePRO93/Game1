import { ALL_WEAPONS, WEAPONS, WeaponId } from '../game/weapons';
import { DamageNumbers } from './damageNumbers';

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
  combo: { mult: number; frac: number } | null;
  /** Wave clock (bonus only). */
  clock: { left: number; par: number } | null;
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
    combo: $('hud-combo'),
    comboMult: $('hud-combo-mult'),
    comboFill: $('hud-combo-fill'),
    clock: $('hud-clock'),
    board: $('hud-board'),
    dmg: $('hud-dmg'),
    comic: $('hud-comic'),
    spectate: $('hud-spectate'),
    teams: $('hud-teams'),
    feed: $('hud-feed'),
    hp: $('hud-hp-fill').parentElement!,
    flash: $('hud-flash'),
  };
  readonly nums = new DamageNumbers($('hud-nums'));
  private last = '';
  private hintTimer = 0;
  private bannerTimer = 0;
  private hitTimer = 0;
  /** Crosshair bloom 0..1 (spreads while firing, settles back). */
  private bloom = 0;
  private bloomShown = -1;

  constructor() {
    this.el.weaponList.innerHTML = WEAPONS.map(
      (w, i) => `<div class="w" data-id="${w.id}"><span>${i + 1}</span> ${w.name}</div>`,
    ).join('');
  }

  /** Multiplayer hides the slow-mo parts and shows the scoreboard; versus also hides the wave parts. */
  setVersus(on: boolean, coop = false): void {
    this.el.root.classList.toggle('versus', on);
    this.el.root.classList.toggle('coop', on && coop);
    if (!on) {
      this.el.board.innerHTML = '';
      this.lastBoard = '';
      this.el.feed.innerHTML = '';
      this.el.teams.style.display = 'none';
      this.spectating(null);
    }
  }

  /** Multiplayer scoreboard (sorted by kills). */
  board(rows: { name: string; kills: number; ink: string; self: boolean }[], goal: number, timeLeft: number, label = 'kills'): void {
    const t = Math.ceil(timeLeft / 1000);
    const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    const html =
      `<div class="goal">${goal > 0 ? `first to ${goal} · ${clock}` : timeLeft > 0 ? `${label} · ${clock}` : label}</div>` +
      rows
        .map((r) => `<div class="row${r.self ? ' self' : ''}"><span class="dot" style="background:${r.ink}"></span><span class="n"></span><b>${r.kills}</b></div>`)
        .join('');
    if (html === this.lastBoard) return;
    this.lastBoard = html;
    this.el.board.innerHTML = html;
    const names = this.el.board.querySelectorAll('.n');
    rows.forEach((r, i) => (names[i].textContent = r.self ? `${r.name} (you)` : r.name));
  }
  private lastBoard = '';

  /** Red arrow around the crosshair pointing where damage came from (radians, 0 = straight ahead, + = to the right). */
  damageArrow(angle: number): void {
    const el = document.createElement('div');
    el.className = 'dmg-arrow';
    el.style.transform = `translate(-50%, -50%) rotate(${angle}rad) translateY(-120px)`;
    this.el.dmg.append(el);
    while (this.el.dmg.children.length > 4) this.el.dmg.firstElementChild!.remove();
    setTimeout(() => el.remove(), 1100);
  }

  /** Comic-book burst ("POW!") popping out near the gun. */
  comic(text: string, big = false): void {
    const el = document.createElement('div');
    el.className = `comic${big ? ' big' : ''}`;
    el.textContent = text;
    const colors = ['#ffe14d', '#ff8fc8', '#7fe0ff', '#b6ff7a', '#ffb347'];
    el.style.setProperty('--bg', colors[Math.floor(Math.random() * colors.length)]);
    el.style.setProperty('--rot', `${(Math.random() - 0.5) * 18}deg`);
    // Around the gun (bottom right), not over the crosshair.
    el.style.right = `${8 + Math.random() * 16}%`;
    el.style.bottom = `${20 + Math.random() * 14}%`;
    this.el.comic.append(el);
    while (this.el.comic.children.length > 3) this.el.comic.firstElementChild!.remove();
    setTimeout(() => el.remove(), 1200);
  }

  spectating(name: string | null): void {
    this.el.spectate.textContent = name ? `spectating ${name}` : '';
    this.el.spectate.style.display = name ? '' : 'none';
  }

  /** Team Deathmatch bar: each team's kills toward the goal. */
  teams(kills: [number, number] | null, names: [string, string], timeLeft: number, myTeam: number | null, goal: number): void {
    this.el.teams.style.display = kills ? '' : 'none';
    if (!kills) return;
    $('tm-0').style.width = `${Math.min(50, (kills[0] / Math.max(1, goal)) * 50)}%`;
    $('tm-1').style.width = `${Math.min(50, (kills[1] / Math.max(1, goal)) * 50)}%`;
    $('tm-l0').textContent = `${names[0]}${myTeam === 0 ? ' (you)' : ''} ${kills[0]}`;
    $('tm-l1').textContent = `${kills[1]} ${names[1]}${myTeam === 1 ? ' (you)' : ''}`;
    const t = Math.ceil(timeLeft / 1000);
    $('tm-time').textContent = `first to ${goal} · ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }

  /** Kill feed line (fades after a few seconds). */
  feed(text: string): void {
    const line = document.createElement('div');
    line.textContent = text;
    this.el.feed.prepend(line);
    while (this.el.feed.children.length > 4) this.el.feed.lastElementChild!.remove();
    setTimeout(() => line.remove(), 5000);
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

  clearBanner(): void {
    this.el.banner.style.opacity = '0';
    this.bannerTimer = 0;
  }

  hitmarker(head: boolean, kill: boolean): void {
    // Restart the bounce animation on every hit.
    this.el.hitmark.className = '';
    void this.el.hitmark.offsetWidth;
    this.el.hitmark.className = `on${head ? ' head' : ''}${kill ? ' kill' : ''}`;
    this.hitTimer = kill ? 0.3 : 0.16;
  }

  /** Spread the crosshair (per shot, 0..1). */
  kickCrosshair(amount: number): void {
    this.bloom = Math.min(1, this.bloom + amount);
  }

  /** Jolt the HP bar when hurt. */
  hurt(): void {
    restartAnim(this.el.hp, 'shake');
  }

  /** Quick white screen flash (versus kills, in place of a freeze frame). */
  whiteFlash(strong = false): void {
    this.el.flash.classList.toggle('strong', strong);
    restartAnim(this.el.flash, 'on');
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
    // Bloom recovers quickly; only touch the DOM when it visibly changes.
    this.bloom = Math.max(0, this.bloom - realDt * 3.5);
    const b = Math.round(this.bloom * 50) / 50;
    if (b !== this.bloomShown) {
      this.bloomShown = b;
      this.el.crosshair.style.setProperty('--bloom', String(b));
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
    const melee = s.mag === Infinity;
    e.ammo.innerHTML = melee
      ? `<b>∞</b> <span class="small">swing!</span>`
      : s.reloading
        ? `<span class="reloading">reloading…</span>`
        : s.reserve === 0 && s.mag > 0 && !WEAPONS.some((w) => w.id === s.weapon)
          ? `<b>${s.ammo}</b> <span class="small">killstreak</span>`
          : `<b>${s.ammo}</b>/${reserve}`;
    const pipCount = melee ? 0 : Math.min(s.mag, 30);
    const filled = Math.round((s.ammo / s.mag) * pipCount);
    let pips = '';
    for (let i = 0; i < pipCount; i++) pips += `<i class="${i < filled ? 'f' : ''}"></i>`;
    e.pips.innerHTML = pips;
    for (const el of Array.from(e.weaponList.children) as HTMLElement[]) {
      el.classList.toggle('active', el.dataset.id === s.weapon);
    }
    const def = ALL_WEAPONS.find((w) => w.id === s.weapon)!;
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
    if (s.combo && s.combo.mult > 1) {
      e.combo.style.display = '';
      const txt = `×${s.combo.mult}`;
      if (e.comboMult.textContent !== txt) {
        e.comboMult.textContent = txt;
        e.combo.classList.remove('pop');
        void e.combo.offsetWidth;
        e.combo.classList.add('pop');
      }
      e.combo.dataset.mult = String(s.combo.mult);
      e.comboFill.style.width = `${s.combo.frac * 100}%`;
    } else {
      e.combo.style.display = 'none';
      e.comboMult.textContent = '';
    }
    if (s.clock) {
      e.clock.style.display = '';
      const left = Math.ceil(s.clock.left);
      e.clock.textContent = left > 0 ? `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} bonus` : '⏱ no bonus';
      e.clock.classList.toggle('urgent', left > 0 && left <= 10);
      e.clock.classList.toggle('gone', left <= 0);
    } else {
      e.clock.style.display = 'none';
    }
    e.scope.style.display = s.zoomed ? '' : 'none';
    e.crosshair.style.display = s.zoomed ? 'none' : '';
  }
}

/** Re-trigger a one-shot CSS animation by toggling its class. */
function restartAnim(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
