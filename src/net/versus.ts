import type { MapId } from '../world/level';
import { MAPS } from '../world/level';
import { Mesh, NetMsg } from './mesh';
import { LocalSignal, PeerMeta, Signal, SupabaseSignal } from './signal';

/**
 * A multiplayer room: up to 4 friends who joined with the same code. The
 * earliest joiner is the host: they pick the mode and press Start (the map is
 * the most voted one), and they run the round clock. In versus everything
 * else (positions, hits, deaths) flows peer to peer; in co-op the host also
 * runs the enemies (see the co-op part of game.ts).
 */
export const MAX_PLAYERS = 4;
export const KILLS_TO_WIN = 10;
export const TEAM_KILLS_TO_WIN = 15;
export const MATCH_MS = 5 * 60 * 1000;
/** Ink colors players are drawn in, by join order. */
export const PLAYER_INKS = ['#c0302a', '#1f7a4a', '#d9730d', '#7a3fc0'];
/** Team Deathmatch colors (orange vs blue). */
export const TEAM_COLORS = ['#ff6a00', '#1e7bff'];
export const TEAM_NAMES = ['orange', 'blue'];

export type Phase = 'lobby' | 'play' | 'end';
export type Mode = 'deathmatch' | 'teams' | 'coop';

export const MODES: { id: Mode; kind: 'versus' | 'co-op'; name: string; blurb: string }[] = [
  { id: 'deathmatch', kind: 'versus', name: 'Free-for-all', blurb: 'everyone for themselves · first to 10 kills' },
  { id: 'teams', kind: 'versus', name: 'Team Deathmatch', blurb: 'orange vs blue · first team to 15 kills' },
  { id: 'coop', kind: 'co-op', name: 'Co-op Waves', blurb: 'your team vs the waves · how far can you get?' },
];

export function parseMode(m: unknown): Mode {
  return m === 'teams' || m === 'coop' ? m : 'deathmatch';
}

export interface RoomPlayer {
  id: string;
  name: string;
  joinedAt: number;
  /** Their "you" drawing as a share token (arrives with hello). */
  token: string | null;
  /** Their enemy + boss drawings as a share token (co-op uses the host's). */
  doodles: string | null;
  ink: string;
  self: boolean;
}

export interface Award {
  id: string;
  title: string;
  blurb: string;
  player: string;
  value: number;
}

export interface RoomState {
  phase: Phase;
  round: number;
  mode: Mode;
  map: MapId;
  votes: Record<string, MapId>;
  /** Kills this round (players in versus, enemies in co-op). */
  scores: Record<string, number>;
  /** Team Deathmatch team per player (0 or 1). */
  teams: Record<string, number>;
  /** Co-op: wave the team is on (or reached, once the round ended). */
  wave: number;
  awards: Award[];
}

/** Player state sent ~20×/s. */
export interface PlayerSnap {
  p: [number, number, number];
  yaw: number;
  sl: number;
  w: number;
  alive: number;
}

export interface KillEvent {
  victim: string;
  by: string;
  head: boolean;
  erased: boolean;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function newRoomCode(): string {
  const b = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(b, (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
}

export function normalizeCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
}

/** Most-voted map; ties broken at random. No votes = random map. */
export function pickMap(votes: Record<string, MapId>, rand = Math.random): MapId {
  const counts = new Map<MapId, number>();
  for (const m of Object.values(votes)) counts.set(m, (counts.get(m) ?? 0) + 1);
  if (!counts.size) return MAPS[Math.floor(rand() * MAPS.length)].id;
  const best = Math.max(...counts.values());
  const top = Array.from(counts.entries()).filter(([, n]) => n === best).map(([m]) => m);
  return top[Math.floor(rand() * top.length)];
}

export function leader(scores: Record<string, number>): { id: string; kills: number } | null {
  let best: { id: string; kills: number } | null = null;
  for (const [id, kills] of Object.entries(scores)) if (!best || kills > best.kills) best = { id, kills };
  return best;
}

/** Split players into two teams, alternating by join order. */
export function makeTeams(ids: string[]): Record<string, number> {
  return Object.fromEntries(ids.map((id, i) => [id, i % 2]));
}

/** Team Deathmatch kills per team. */
export function teamKills(scores: Record<string, number>, teams: Record<string, number>): [number, number] {
  const out: [number, number] = [0, 0];
  for (const [id, k] of Object.entries(scores)) {
    const t = teams[id];
    if (t === 0 || t === 1) out[t] += k;
  }
  return out;
}

/** Fun end-of-round awards from the kill log (co-op kills have victim 'enemy'). */
export function computeAwards(events: KillEvent[], ids: string[]): Award[] {
  const count = (f: (e: KillEvent) => string | null) => {
    const m = new Map<string, number>();
    for (const e of events) {
      const id = f(e);
      if (id) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  };
  const kills = count((e) => (e.by !== e.victim ? e.by : null));
  const heads = count((e) => (e.head && e.by !== e.victim ? e.by : null));
  const erases = count((e) => (e.erased && e.by !== e.victim ? e.by : null));
  const deaths = count((e) => e.victim);
  const streaks = new Map<string, number>();
  const run = new Map<string, number>();
  for (const e of events) {
    run.set(e.victim, 0);
    if (e.by === e.victim) continue;
    const r = (run.get(e.by) ?? 0) + 1;
    run.set(e.by, r);
    streaks.set(e.by, Math.max(streaks.get(e.by) ?? 0, r));
  }
  const top = (m: Map<string, number>, min: number): [string, number] | null => {
    let best: [string, number] | null = null;
    for (const [id, v] of m) if (ids.includes(id) && v >= min && (!best || v > best[1])) best = [id, v];
    return best;
  };
  const out: Award[] = [];
  const add = (id: string, title: string, blurb: (v: number) => string, t: [string, number] | null) => {
    if (t) out.push({ id, title, blurb: blurb(t[1]), player: t[0], value: t[1] });
  };
  add('mvp', 'MVP', (v) => `${v} kills`, top(kills, 1));
  add('sharpshooter', 'Sharpshooter', (v) => `${v} headshot${v === 1 ? '' : 's'}`, top(heads, 1));
  add('streak', 'Unstoppable', (v) => `${v} kills in a row`, top(streaks, 2));
  add('eraser', 'Clean Sweep', (v) => `${v} eraser kill${v === 1 ? '' : 's'}`, top(erases, 1));
  add('doormat', 'Doormat', (v) => (v === 1 ? 'erased once' : `erased ${v} times`), top(deaths, 1));
  return out;
}

export class VersusRoom {
  readonly code: string;
  readonly mesh: Mesh;
  private signal: Signal;
  players = new Map<string, RoomPlayer>();
  state: RoomState = { phase: 'lobby', round: 0, mode: 'deathmatch', map: 'construction', votes: {}, scores: {}, teams: {}, wave: 0, awards: [] };
  /** Local time (performance.now) when the current phase's clock runs out; 0 = no clock. */
  deadline = 0;
  private hostBeat = 0;
  private lastHost = '';
  private closed = false;
  private lastRound = 0;
  /** Host: kill log for awards. */
  private events: KillEvent[] = [];

  /** Roster, votes, scores or phase changed. */
  onChange: () => void = () => {};
  /** A new phase started (play = load the map and spawn). */
  onPhase: (phase: Phase, prev: Phase) => void = () => {};
  onSnap: (id: string, s: PlayerSnap) => void = () => {};
  onShot: (id: string, from: number[], ends: number[][], weapon: number) => void = () => {};
  onSwing: (id: string) => void = () => {};
  onHit: (from: string, dmg: number, head: boolean, erased: boolean) => void = () => {};
  onDied: (victim: string, by: string, head: boolean, erased: boolean) => void = () => {};
  onLeft: (id: string) => void = () => {};
  onFull: () => void = () => {};
  /** Co-op game traffic (enemies, enemy shots, hits on enemies, waves). */
  onCoop: (from: string, m: NetMsg) => void = () => {};

  constructor(
    code: string,
    private selfName: string,
    private selfToken: string,
    private selfDoodles: string,
    local = false,
  ) {
    this.code = code;
    this.signal = local ? new LocalSignal() : new SupabaseSignal();
    this.mesh = new Mesh(this.signal);
    this.mesh.onOpen = (id) => this.mesh.send(id, this.hello(), true);
    this.mesh.onClose = (id) => this.removePlayer(id);
    this.mesh.onMessage = (from, m) => this.handle(from, m);
    this.signal.onPeers = (peers) => this.setRoster(peers);
  }

  get selfId(): string {
    return this.signal.selfId;
  }

  async join(): Promise<void> {
    const me: PeerMeta = { id: this.selfId, name: this.selfName, joinedAt: Date.now() };
    this.players.set(me.id, { ...me, token: this.selfToken, doodles: this.selfDoodles, ink: PLAYER_INKS[0], self: true });
    await this.signal.join(this.code, me);
  }

  leave(): void {
    this.closed = true;
    this.mesh.close();
    this.signal.leave();
  }

  get hostId(): string {
    const sorted = this.sortedPlayers();
    return sorted.length ? sorted[0].id : this.selfId;
  }

  get isHost(): boolean {
    return this.hostId === this.selfId;
  }

  sortedPlayers(): RoomPlayer[] {
    return Array.from(this.players.values()).sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1));
  }

  get timeLeft(): number {
    return this.deadline ? Math.max(0, this.deadline - performance.now()) : 0;
  }

  get mode(): Mode {
    return this.state.mode;
  }

  playerCount(): number {
    return this.players.size;
  }

  /**
   * Team of a player: 0/1 in Team Deathmatch, 0 for everyone in co-op (no
   * friendly fire), null in free-for-all.
   */
  teamOf(id: string): number | null {
    if (this.state.mode === 'coop') return 0;
    if (this.state.mode !== 'teams') return null;
    const t = this.state.teams[id];
    return t === 0 || t === 1 ? t : null;
  }

  private hello(): NetMsg {
    return { t: 'hello', name: this.selfName, token: this.selfToken, dd: this.selfDoodles };
  }

  // ── Outgoing ──────────────────────────────────────────────────────────
  /** My drawing changed: update it everywhere. */
  setToken(token: string): void {
    if (token === this.selfToken) return;
    this.selfToken = token;
    const me = this.players.get(this.selfId);
    if (me) me.token = token;
    this.mesh.broadcast(this.hello(), true);
    this.onChange();
  }

  vote(map: MapId): void {
    if (this.state.phase !== 'lobby') return;
    this.state.votes[this.selfId] = map;
    this.mesh.broadcast({ t: 'vote', map }, true);
    this.onChange();
    if (this.isHost) this.sendState();
  }

  /** Host only: choose the mode. */
  setMode(mode: Mode): void {
    if (!this.isHost || this.state.phase !== 'lobby') return;
    this.state.mode = mode;
    this.sendState();
    this.onChange();
  }

  /** Host only: start a round on the most-voted map. */
  start(): boolean {
    if (!this.isHost || this.state.phase === 'play' || this.players.size < 2) return false;
    this.state.map = pickMap(this.state.votes);
    this.beginRound();
    return true;
  }

  /** Host only: same map and mode again. */
  rematch(): boolean {
    if (!this.isHost || this.state.phase !== 'end' || this.players.size < 2) return false;
    this.beginRound();
    return true;
  }

  /** Host only: back to the lobby to vote / change mode. */
  toLobby(): void {
    if (!this.isHost) return;
    this.state.votes = {};
    this.setPhase('lobby', 0);
  }

  sendSnap(s: PlayerSnap): void {
    this.mesh.broadcast({ t: 's', ...s }, false);
  }

  sendShot(from: number[], ends: number[][], weapon: number): void {
    this.mesh.broadcast({ t: 'f', o: from, e: ends, w: weapon }, false);
  }

  /** Co-op traffic to everyone (or one player). */
  sendCoop(m: Record<string, unknown>, reliable: boolean, to?: string): void {
    const msg = { ...m, t: 'c' };
    if (to) this.mesh.send(to, msg, reliable);
    else this.mesh.broadcast(msg, reliable);
  }

  /** Host, co-op: someone killed an enemy. */
  coopKill(by: string, head: boolean, erased: boolean): void {
    if (!this.isHost) return;
    this.recordKill({ victim: 'enemy', by, head, erased });
    this.onChange();
  }

  /** Host, co-op: the team reached a new wave. */
  setWave(wave: number): void {
    if (!this.isHost || this.state.wave === wave) return;
    this.state.wave = wave;
    this.sendState();
  }

  /** Host, co-op: everyone is down, the run is over. */
  coopOver(wave: number): void {
    if (!this.isHost || this.state.phase !== 'play') return;
    this.state.wave = wave;
    this.endRound();
  }

  sendSwing(): void {
    this.mesh.broadcast({ t: 'sw' }, false);
  }

  sendHit(to: string, dmg: number, head: boolean, erased: boolean): void {
    this.mesh.send(to, { t: 'hit', dmg, head, er: erased ? 1 : 0 }, true);
  }

  /** I died: tell everyone who got the kill. */
  sendDied(by: string, head: boolean, erased: boolean): void {
    this.recordKill({ victim: this.selfId, by, head, erased });
    this.mesh.broadcast({ t: 'died', by, head, erased }, true);
    this.onChange();
    if (this.isHost) this.hostTick(true);
  }

  // ── Incoming ──────────────────────────────────────────────────────────
  private setRoster(peers: PeerMeta[]): void {
    if (this.closed) return;
    const ids = new Set(peers.map((p) => p.id));
    ids.add(this.selfId);
    // Room full: the latest joiners beyond 4 back out.
    const sorted = [...peers].sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1));
    const rank = sorted.findIndex((p) => p.id === this.selfId);
    if (rank >= MAX_PLAYERS) {
      this.leave();
      this.onFull();
      return;
    }
    const allowed = sorted.slice(0, MAX_PLAYERS);
    for (const p of allowed) {
      if (p.id === this.selfId) continue;
      const cur = this.players.get(p.id);
      if (!cur) this.players.set(p.id, { id: p.id, name: p.name, joinedAt: p.joinedAt, token: null, doodles: null, ink: PLAYER_INKS[0], self: false });
    }
    for (const id of Array.from(this.players.keys())) if (!ids.has(id) || !allowed.some((p) => p.id === id)) if (id !== this.selfId) this.removePlayer(id);
    this.mesh.setPeers(allowed.filter((p) => p.id !== this.selfId));
    this.assignInks();
    this.onChange();
    if (this.isHost) this.hostTick(true);
  }

  private assignInks(): void {
    this.sortedPlayers().forEach((p, i) => (p.ink = PLAYER_INKS[i % PLAYER_INKS.length]));
  }

  private removePlayer(id: string): void {
    if (!this.players.delete(id)) return;
    delete this.state.votes[id];
    this.assignInks();
    this.onLeft(id);
    this.onChange();
    if (this.isHost) this.hostTick(true);
  }

  private recordKill(e: KillEvent): void {
    if (this.state.phase !== 'play') return;
    if (e.by !== e.victim && this.players.has(e.by)) this.state.scores[e.by] = (this.state.scores[e.by] ?? 0) + 1;
    this.events.push(e);
  }

  private handle(from: string, m: NetMsg): void {
    if (this.closed) return;
    const p = this.players.get(from);
    switch (m.t) {
      case 'hello':
        if (p) {
          p.name = String(m.name ?? p.name).slice(0, 16);
          p.token = typeof m.token === 'string' ? m.token.slice(0, 20000) : null;
          p.doodles = typeof m.dd === 'string' ? m.dd.slice(0, 40000) : null;
          this.onChange();
        }
        if (this.isHost) {
          // Late joiner in Team Deathmatch: put them on the smaller team.
          if (this.state.phase === 'play' && this.state.mode === 'teams' && this.state.teams[from] === undefined) {
            const n0 = Object.values(this.state.teams).filter((t) => t === 0).length;
            const n1 = Object.values(this.state.teams).filter((t) => t === 1).length;
            this.state.teams[from] = n0 <= n1 ? 0 : 1;
            this.sendState();
          } else this.sendState(from);
        }
        break;
      case 'vote':
        if (this.state.phase === 'lobby' && p && MAPS.some((x) => x.id === m.map)) {
          this.state.votes[from] = m.map as MapId;
          this.onChange();
          if (this.isHost) this.sendState();
        }
        break;
      case 'st':
        if (from === this.hostId) this.applyState(m);
        break;
      case 's':
        this.onSnap(from, m as unknown as PlayerSnap);
        break;
      case 'f':
        this.onShot(from, m.o as number[], m.e as number[][], m.w as number);
        break;
      case 'sw':
        this.onSwing(from);
        break;
      case 'hit':
        if (this.state.phase === 'play') this.onHit(from, Math.min(400, Number(m.dmg) || 0), !!m.head, !!m.er);
        break;
      case 'c':
        if (this.state.phase === 'play') this.onCoop(from, m);
        break;
      case 'died':
        this.recordKill({ victim: from, by: String(m.by), head: !!m.head, erased: !!m.erased });
        this.onDied(from, String(m.by), !!m.head, !!m.erased);
        this.onChange();
        if (this.isHost) this.hostTick(true);
        break;
    }
  }

  private applyState(m: NetMsg): void {
    const prev = this.state.phase;
    const round = Number(m.round);
    this.state = {
      phase: m.phase as Phase,
      round,
      mode: parseMode(m.mode),
      map: m.map as MapId,
      votes: (m.votes as Record<string, MapId>) ?? {},
      scores: (m.scores as Record<string, number>) ?? {},
      teams: (m.teams as Record<string, number>) ?? {},
      wave: Number(m.wave) || 0,
      awards: Array.isArray(m.awards) ? (m.awards as Award[]).slice(0, 8) : [],
    };
    const left = Number(m.left) || 0;
    this.deadline = left > 0 ? performance.now() + left : 0;
    if (prev !== this.state.phase || round !== this.lastRound) this.onPhase(this.state.phase, prev);
    this.lastRound = round;
    this.onChange();
  }

  // ── Host ──────────────────────────────────────────────────────────────
  private sendState(to?: string): void {
    const msg: NetMsg = { t: 'st', ...this.state, left: Math.round(this.timeLeft) };
    if (to) this.mesh.send(to, msg, true);
    else this.mesh.broadcast(msg, true);
  }

  private beginRound(): void {
    const s = this.state;
    const ids = this.sortedPlayers().map((p) => p.id);
    s.round++;
    s.scores = Object.fromEntries(ids.map((id) => [id, 0]));
    s.teams = s.mode === 'teams' ? makeTeams(ids) : {};
    s.wave = 0;
    s.awards = [];
    this.events = [];
    // Co-op has no clock: it runs until the whole team is down.
    this.setPhase('play', s.mode === 'coop' ? 0 : MATCH_MS);
  }

  private endRound(): void {
    const s = this.state;
    s.awards = computeAwards(this.events, this.sortedPlayers().map((p) => p.id));
    this.setPhase('end', 0);
  }

  private setPhase(phase: Phase, ms: number): void {
    const prev = this.state.phase;
    this.state.phase = phase;
    this.deadline = ms > 0 ? performance.now() + ms : 0;
    this.onPhase(phase, prev);
    this.lastRound = this.state.round;
    this.sendState();
    this.onChange();
  }

  /** Call regularly. The host runs the round clock; everyone else just follows. */
  tick(): void {
    if (this.closed) return;
    if (this.hostId !== this.lastHost) {
      this.lastHost = this.hostId;
      if (this.isHost && this.state.phase === 'play') {
        // The co-op enemies lived on the old host, so the run ends where it got to.
        if (this.state.mode === 'coop') this.coopOver(this.state.wave);
        // Took over as host mid-round with no clock: give the round a fresh one.
        else if (!this.deadline) this.deadline = performance.now() + MATCH_MS;
      }
    }
    if (this.isHost) this.hostTick(false);
  }

  private hostTick(force: boolean): void {
    const n = this.players.size;
    const s = this.state;
    const now = performance.now();
    if (s.phase === 'play') {
      if (n < 2) {
        this.toLobby();
        return;
      }
      const top = leader(s.scores);
      const won =
        s.mode === 'deathmatch'
          ? !!top && top.kills >= KILLS_TO_WIN
          : s.mode === 'teams' && teamKills(s.scores, s.teams).some((k) => k >= TEAM_KILLS_TO_WIN);
      if (won || (this.deadline && now >= this.deadline)) {
        this.endRound();
        return;
      }
    }
    if (force || now - this.hostBeat > 1000) {
      this.hostBeat = now;
      this.sendState();
    }
  }
}
