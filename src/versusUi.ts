import { DrawPad, PAD_H, PAD_W, heroExampleStrokes, paintStrokes } from './draw/drawPad';
import { buildSprite, DoodleSprite } from './draw/sprite';
import type { Game } from './game/game';
import { RemotePlayer } from './game/remotePlayer';
import { decodeShare, encodeShare, Stroke } from './game/share';
import type { Input } from './game/input';
import type { Hud } from './ui/hud';
import { currentAccount, requireAccount } from './net/accountUi';
import { KILLS_TO_WIN, Phase, VersusRoom, leader, newRoomCode, normalizeCode } from './net/versus';
import { MAPS, mapInfo } from './world/level';

export type Screen = 'menu' | 'playing' | 'paused' | 'over' | 'upgrade' | 'versus';

export interface VersusCtx {
  game: Game;
  pad: DrawPad;
  hud: Hud;
  input: Input;
  show: (s: Screen) => void;
  screen: () => Screen;
  /** Force a look for the match (not saved). */
  setLook: (color: boolean) => void;
  /** Put the solo map + look back. */
  restoreSolo: () => void;
  testMode: boolean;
  params: URLSearchParams;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/**
 * Versus flow: create/join by code → room screen (players + map vote) →
 * match → results → vote again. The room logic lives in net/versus.ts; this
 * wires it to the game and the DOM.
 */
export function initVersus(ctx: VersusCtx) {
  const { game, pad, hud, input } = ctx;
  let room: VersusRoom | null = null;
  const strokeCache = new Map<string, Promise<Stroke[] | null>>();
  let placeholder: DoodleSprite | null = null;

  const msg = (t: string) => ($('versus-msg').textContent = t);

  function strokesOf(token: string | null): Promise<Stroke[] | null> {
    if (!token) return Promise.resolve(null);
    let p = strokeCache.get(token);
    if (!p) {
      p = decodeShare(token).then(
        (d) => (d.enemy.length ? d.enemy : null),
        () => null,
      );
      strokeCache.set(token, p);
    }
    return p;
  }

  function spriteFrom(strokes: Stroke[]): DoodleSprite | null {
    const cv = document.createElement('canvas');
    cv.width = PAD_W;
    cv.height = PAD_H;
    paintStrokes(cv.getContext('2d', { willReadFrequently: true })!, strokes);
    return buildSprite(cv);
  }

  function placeholderSprite(): DoodleSprite {
    placeholder ??= spriteFrom(heroExampleStrokes())!;
    return placeholder;
  }

  // ── Join / leave ─────────────────────────────────────────────────────
  function withName(then: (name: string) => void): void {
    const forced = ctx.params.get('name');
    if (forced) return then(forced.slice(0, 16));
    requireAccount(() => then(currentAccount().username!), 'to play versus (it shows above your head)');
  }

  async function join(code: string): Promise<void> {
    if (room) leave(false);
    code = normalizeCode(code);
    if (code.length !== 5) {
      msg('codes are 5 letters');
      return;
    }
    withName(async (name) => {
      pad.ensure('me');
      const token = await encodeShare({ enemy: pad.getStrokes('me'), boss: [] });
      const r = new VersusRoom(code, name, token, ctx.params.get('net') === 'local');
      room = r;
      wire(r);
      history.replaceState(null, '', `${location.pathname}${location.search}#room=${code}`);
      $('vs-code').textContent = code;
      $('vs-status').textContent = 'connecting…';
      padIntoRoom();
      ctx.show('versus');
      render();
      try {
        await r.join();
        render();
      } catch (err) {
        if (room === r) leave(false);
        msg((err as Error).message || "couldn't join");
      }
    });
  }

  function leave(toMenu = true): void {
    if (room) {
      room.leave();
      room = null;
    }
    game.stopVersus();
    ctx.restoreSolo();
    hud.setVersus(false);
    padHomeAgain();
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    if (toMenu) {
      input.unlock();
      ctx.show('menu');
    }
  }

  function wire(r: VersusRoom): void {
    r.onChange = () => {
      if (room !== r) return;
      syncRemotes();
      render();
    };
    r.onPhase = (phase, prev) => {
      if (room !== r) return;
      onPhase(phase, prev);
    };
    r.onSnap = (id, s) => game.remotes.get(id)?.push(s);
    r.onShot = (id, o, e, w) => game.remoteShot(id, o, e, w);
    r.onSwing = (id) => game.remoteSwing(id);
    r.onHit = (from, dmg, head, erased) => game.versusHit(from, dmg, head, erased);
    r.onDied = (victim, by, head, erased) => game.remoteDied(victim, by, head, erased, r.selfId);
    r.onLeft = (id) => {
      const name = game.remotes.get(id)?.name;
      game.removeRemote(id);
      if (name && game.versus) hud.feed(`${name} left`);
    };
    r.onFull = () => {
      room = null;
      leave(true);
      msg('that game is full (4 players max)');
    };
  }

  function onPhase(phase: Phase, _prev: Phase): void {
    if (!room) return;
    if (phase === 'play') {
      const info = mapInfo(room.state.map);
      game.setMap(info.id);
      ctx.setLook(info.look === 'color');
      game.startVersus(room);
      syncRemotes();
      if (ctx.testMode) {
        ctx.show('playing');
        input.locked = true;
      } else {
        // Pointer lock needs a click, so the round starts from the pause card.
        $('pause-title').textContent = `round ${room.state.round}: ${info.name}`;
        $('btn-resume').textContent = 'click to play';
        $('btn-quit').textContent = 'leave the game';
        ctx.show('paused');
      }
    } else {
      game.stopVersus();
      input.unlock();
      ctx.show('versus');
    }
    render();
  }

  /** Keep the game's remote players in step with the room roster. */
  function syncRemotes(): void {
    if (!room || !game.versus) return;
    for (const p of room.players.values()) {
      if (p.self) continue;
      let rp = game.remotes.get(p.id);
      if (!rp) {
        rp = new RemotePlayer(p.id, p.name, p.ink, placeholderSprite());
        game.addRemote(rp);
        rp.userToken = null;
      }
      rp.setName(p.name, p.ink);
      if (p.token && rp.userToken !== p.token) {
        const target = rp;
        target.userToken = p.token;
        void strokesOf(p.token).then((strokes) => {
          const sp = strokes ? spriteFrom(strokes) : null;
          if (sp && game.remotes.get(p.id) === target) target.setSprite(sp);
        });
      }
    }
    for (const id of Array.from(game.remotes.keys())) if (!room.players.has(id)) game.removeRemote(id);
  }

  // ── Room screen ──────────────────────────────────────────────────────
  for (const m of MAPS) {
    const b = document.createElement('button');
    b.className = 'map-btn';
    b.dataset.map = m.id;
    b.innerHTML = `<img class="map-shot" src="/img/maps/${m.id}.webp" alt="" loading="lazy" /><span class="votes"></span><span class="name"></span><span class="look ${m.look}">${m.look}</span><small></small>`;
    b.querySelector('.name')!.textContent = m.name;
    b.querySelector('small')!.textContent = m.blurb;
    b.onclick = () => room?.vote(m.id);
    $('vs-maps').append(b);
  }

  const thumbs = new Map<string, HTMLCanvasElement>();
  function thumb(id: string, token: string | null, ink: string): HTMLCanvasElement {
    const key = `${id}|${token}|${ink}`;
    let cv = thumbs.get(key);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.width = 96;
    cv.height = 120;
    const c = cv.getContext('2d')!;
    const draw = (strokes: Stroke[]) => {
      c.clearRect(0, 0, 96, 120);
      paintStrokes(c, strokes, 96 / PAD_W, ink);
    };
    draw(heroExampleStrokes());
    void strokesOf(token).then((s) => s && draw(s));
    thumbs.set(key, cv);
    return cv;
  }

  function render(): void {
    if (!room) return;
    const s = room.state;
    const players = room.sortedPlayers();
    const n = players.length;
    const ended = s.phase === 'end';
    $('vs-setup').style.display = ended ? 'none' : '';
    $('vs-results').style.display = ended ? '' : 'none';

    if (ended) {
      const top = leader(s.scores);
      const winner = top ? room.players.get(top.id) : null;
      $('vs-title').textContent = winner ? (winner.self ? 'you win!' : `${winner.name} wins!`) : 'round over';
    } else {
      $('vs-title').textContent = 'versus';
      const me = s.votes[room.selfId];
      $('vs-status').textContent =
        n < 2
          ? 'waiting for friends… send them the code or the invite link. draw your fighter while you wait!'
          : me
            ? 'voted! waiting for everyone else (you can still change your drawing or vote)'
            : 'draw your fighter, then vote for a map. the round starts when everyone has voted.';
    }

    const host = ended ? $('vs-results') : $('vs-players');
    $('vs-players').innerHTML = '';
    $('vs-results').innerHTML = '';
    const ranked = ended ? [...players].sort((a, b) => (s.scores[b.id] ?? 0) - (s.scores[a.id] ?? 0)) : players;
    for (const p of ranked) {
      const card = document.createElement('div');
      card.className = 'vs-player';
      card.append(thumb(p.id, p.token, p.ink));
      const name = document.createElement('div');
      name.textContent = p.self ? `${p.name} (you)` : p.name;
      name.style.color = p.ink;
      card.append(name);
      const sub = document.createElement('div');
      if (ended) {
        sub.className = 'kills';
        sub.textContent = `${s.scores[p.id] ?? 0} kills`;
      } else {
        sub.className = 'vote';
        const v = s.votes[p.id];
        sub.textContent = v ? `✓ ${mapInfo(v).name}` : 'still choosing…';
      }
      card.append(sub);
      if (!p.self && room.mesh.isRelayed(p.id)) {
        const slow = document.createElement('div');
        slow.className = 'vote';
        slow.textContent = '(slow link)';
        card.append(slow);
      }
      host.append(card);
    }

    const counts = new Map<string, number>();
    for (const v of Object.values(s.votes)) counts.set(v, (counts.get(v) ?? 0) + 1);
    for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>('#vs-maps .map-btn'))) {
      const c = counts.get(b.dataset.map!) ?? 0;
      b.querySelector('.votes')!.textContent = c ? '✓'.repeat(c) : '';
      b.classList.toggle('active', s.votes[room.selfId] === b.dataset.map);
    }
    renderTimer();
  }

  function renderTimer(): void {
    if (!room) return;
    const s = room.state;
    const sec = Math.ceil(room.timeLeft / 1000);
    if (s.phase === 'vote') $('vs-timer').textContent = room.timeLeft > 0 ? `starting in ${sec}s, or as soon as everyone votes` : '';
    if (s.phase === 'end') $('vs-status').textContent = `round ${s.round} on ${mapInfo(s.map).name} · next map vote in ${sec}s`;
  }

  // ── Your fighter: the drawing pad moves into the room while you're in one ──
  const padEl = $('pad');
  const padHome = padEl.parentElement!;
  const padNext = padEl.nextSibling;
  function padIntoRoom(): void {
    $('vs-pad-host').append(padEl);
    pad.setSheet('me');
    for (const t of Array.from(document.querySelectorAll<HTMLElement>('.tab'))) t.classList.toggle('active', t.dataset.sheet === 'me');
    pad.ensure('me');
  }
  function padHomeAgain(): void {
    if (padEl.parentElement !== padHome) padHome.insertBefore(padEl, padNext);
  }
  let tokenTimer = 0;
  const prevOnChange = pad.onChange;
  pad.onChange = () => {
    prevOnChange();
    if (!room || pad.sheet !== 'me') return;
    clearTimeout(tokenTimer);
    const r = room;
    tokenTimer = window.setTimeout(async () => {
      if (room !== r || pad.isEmpty('me')) return;
      r.setToken(await encodeShare({ enemy: pad.getStrokes('me'), boss: [] }));
    }, 500);
  };
  $('vs-undo').onclick = () => pad.undo();
  $('vs-clear').onclick = () => pad.clear();
  $('vs-example').onclick = () => pad.example();

  // ── Buttons ──────────────────────────────────────────────────────────
  $('btn-create').onclick = () => {
    msg('');
    void join(newRoomCode());
  };
  $('btn-join').onclick = () => {
    msg('');
    void join($<HTMLInputElement>('vs-code-in').value);
  };
  $<HTMLInputElement>('vs-code-in').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('btn-join').click();
  });
  $('vs-leave').onclick = () => leave(true);
  $('vs-copy').onclick = async () => {
    if (!room) return;
    const url = `${location.origin}${location.pathname}#room=${room.code}`;
    try {
      await navigator.clipboard.writeText(url);
      $('vs-copy').textContent = 'link copied!';
    } catch {
      $('vs-copy').textContent = url;
    }
    setTimeout(() => ($('vs-copy').textContent = 'copy invite link'), 2500);
  };

  game.onVersusEvent = (t) => hud.feed(t);

  // Opened an invite link: join straight away.
  const m = location.hash.match(/[#&]room=([A-Za-z]{5})/);
  if (m) setTimeout(() => void join(m[1]), 50);

  // Hidden tabs pause requestAnimationFrame; keep the room clock (and the
  // host's round timer) running anyway.
  setInterval(() => room?.tick(), 500);

  let timerAcc = 0;
  return {
    get active(): boolean {
      return !!room;
    },
    get playing(): boolean {
      return !!room && room.state.phase === 'play';
    },
    leave: () => leave(true),
    /** Per-frame: run the room clock and refresh the scoreboard. */
    tick(realDt: number): void {
      if (!room) return;
      room.tick();
      timerAcc += realDt;
      if (timerAcc < 0.2) return;
      timerAcc = 0;
      if (room.state.phase === 'play') {
        const rows = room.sortedPlayers().map((p) => ({ name: p.name, kills: room!.state.scores[p.id] ?? 0, ink: p.ink, self: p.self }));
        rows.sort((a, b) => b.kills - a.kills);
        hud.board(rows, KILLS_TO_WIN, room.timeLeft);
      } else if (ctx.screen() === 'versus') {
        renderTimer();
      }
    },
    /** Test hook. */
    get room(): VersusRoom | null {
      return room;
    },
  };
}
