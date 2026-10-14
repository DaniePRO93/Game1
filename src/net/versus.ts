import type { MapId } from '../world/level';
import { MAPS } from '../world/level';
import { Mesh, NetMsg } from './mesh';
import { LocalSignal, PeerMeta, Signal, SupabaseSignal } from './signal';

/**
 * A versus room: up to 4 friends who joined with the same code. The earliest
 * joiner is the host and runs the round clock: map vote → match → results →
 * vote again. Everything else (positions, hits, deaths) flows peer to peer.
 */
export const MAX_PLAYERS = 4;
export const KILLS_TO_WIN = 10;
export const MATCH_MS = 5 * 60 * 1000;
export const VOTE_MS = 20 * 1000;
export const RESULTS_MS = 10 * 1000;
/** Ink colors players are drawn in, by join order. */
export const PLAYER_INKS = ['#c0302a', '#1f7a4a', '#d9730d', '#7a3fc0'];

export type Phase = 'vote' | 'play' | 'end';

export interface RoomPlayer {
  id: string;
  name: string;
  joinedAt: number;
  /** Their "you" drawing as a share token (arrives with hello). */
  token: string | null;
  ink: string;
  self: boolean;
}

export interface RoomState {
  phase: Phase;
  round: number;
  map: MapId;
  votes: Record<string, MapId>;
  scores: Record<string, number>;
}

/** Player state sent ~20×/s. */
export interface PlayerSnap {
  p: [number, number, number];
  yaw: number;
  sl: number;
  w: number;
  alive: number;
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

export class VersusRoom {
  readonly code: string;
  readonly mesh: Mesh;
  private signal: Signal;
  players = new Map<string, RoomPlayer>();
  state: RoomState = { phase: 'vote', round: 0, map: 'construction', votes: {}, scores: {} };
  /** Local time (performance.now) when the current phase's clock runs out; 0 = no clock. */
  deadline = 0;
  private hostBeat = 0;
  private lastHost = '';
  private closed = false;

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

  constructor(code: string, private selfName: string, private selfToken: string, local = false) {
    this.code = code;
    this.signal = local ? new LocalSignal() : new SupabaseSignal();
    this.mesh = new Mesh(this.signal);
    this.mesh.onOpen = (id) => this.mesh.send(id, { t: 'hello', name: this.selfName, token: this.selfToken }, true);
    this.mesh.onClose = (id) => this.removePlayer(id);
    this.mesh.onMessage = (from, m) => this.handle(from, m);
    this.signal.onPeers = (peers) => this.setRoster(peers);
  }

  get selfId(): string {
    return this.signal.selfId;
  }

  async join(): Promise<void> {
    const me: PeerMeta = { id: this.selfId, name: this.selfName, joinedAt: Date.now() };
    this.players.set(me.id, { ...me, token: this.selfToken, ink: PLAYER_INKS[0], self: true });
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

  // ── Outgoing ──────────────────────────────────────────────────────────
  /** My drawing changed: update it everywhere. */
  setToken(token: string): void {
    if (token === this.selfToken) return;
    this.selfToken = token;
    const me = this.players.get(this.selfId);
    if (me) me.token = token;
    this.mesh.broadcast({ t: 'hello', name: this.selfName, token }, true);
    this.onChange();
  }

  vote(map: MapId): void {
    if (this.state.phase !== 'vote') return;
    this.state.votes[this.selfId] = map;
    this.mesh.broadcast({ t: 'vote', map }, true);
    this.onChange();
    if (this.isHost) this.hostTick(true);
  }

  sendSnap(s: PlayerSnap): void {
    this.mesh.broadcast({ t: 's', ...s }, false);
  }

  sendShot(from: number[], ends: number[][], weapon: number): void {
    this.mesh.broadcast({ t: 'f', o: from, e: ends, w: weapon }, false);
  }

  sendSwing(): void {
    this.mesh.broadcast({ t: 'sw' }, false);
  }

  sendHit(to: string, dmg: number, head: boolean, erased: boolean): void {
    this.mesh.send(to, { t: 'hit', dmg, head, er: erased ? 1 : 0 }, true);
  }

  /** I died: tell everyone who got the kill. */
  sendDied(by: string, head: boolean, erased: boolean): void {
    this.countKill(by);
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
      if (!cur) this.players.set(p.id, { id: p.id, name: p.name, joinedAt: p.joinedAt, token: null, ink: PLAYER_INKS[0], self: false });
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

  private countKill(by: string): void {
    if (this.state.phase !== 'play') return;
    this.state.scores[by] = (this.state.scores[by] ?? 0) + 1;
  }

  private handle(from: string, m: NetMsg): void {
    if (this.closed) return;
    const p = this.players.get(from);
    switch (m.t) {
      case 'hello':
        if (p) {
          p.name = String(m.name ?? p.name).slice(0, 16);
          p.token = typeof m.token === 'string' ? m.token.slice(0, 20000) : null;
          this.onChange();
        }
        // Late joiner: the host brings them up to speed.
        if (this.isHost) this.sendState(from);
        break;
      case 'vote':
        if (this.state.phase === 'vote' && p && MAPS.some((x) => x.id === m.map)) {
          this.state.votes[from] = m.map as MapId;
          this.onChange();
          if (this.isHost) this.hostTick(true);
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
      case 'died':
        this.countKill(String(m.by));
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
      map: m.map as MapId,
      votes: (m.votes as Record<string, MapId>) ?? {},
      scores: (m.scores as Record<string, number>) ?? {},
    };
    const left = Number(m.left) || 0;
    this.deadline = left > 0 ? performance.now() + left : 0;
    if (prev !== this.state.phase || round !== this.lastRound) this.onPhase(this.state.phase, prev);
    this.lastRound = round;
    this.onChange();
  }
  private lastRound = 0;

  // ── Host ──────────────────────────────────────────────────────────────
  private sendState(to?: string): void {
    const msg: NetMsg = { t: 'st', ...this.state, left: Math.round(this.timeLeft) };
    if (to) this.mesh.send(to, msg, true);
    else this.mesh.broadcast(msg, true);
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

  /** Call every frame. The host advances the round; everyone else just follows. */
  tick(): void {
    if (this.closed) return;
    if (this.hostId !== this.lastHost) {
      this.lastHost = this.hostId;
      // Took over as host: keep the current phase but restart its clock if it had none.
      if (this.isHost && !this.deadline && this.state.phase !== 'vote') this.deadline = performance.now() + (this.state.phase === 'play' ? MATCH_MS : RESULTS_MS);
    }
    if (this.isHost) this.hostTick(false);
  }

  private hostTick(force: boolean): void {
    const n = this.players.size;
    const s = this.state;
    const now = performance.now();
    if (s.phase === 'vote') {
      if (n < 2) {
        this.deadline = 0;
      } else {
        if (!this.deadline) this.deadline = now + VOTE_MS;
        const allVoted = this.sortedPlayers().every((p) => s.votes[p.id]);
        if (allVoted || now >= this.deadline) {
          s.round++;
          s.map = pickMap(s.votes);
          s.scores = Object.fromEntries(this.sortedPlayers().map((p) => [p.id, 0]));
          this.setPhase('play', MATCH_MS);
          return;
        }
      }
    } else if (s.phase === 'play') {
      const top = leader(s.scores);
      if (n < 2 || (top && top.kills >= KILLS_TO_WIN) || now >= this.deadline) {
        this.setPhase(n < 2 ? 'vote' : 'end', n < 2 ? 0 : RESULTS_MS);
        return;
      }
    } else if (s.phase === 'end' && now >= this.deadline) {
      s.votes = {};
      this.setPhase('vote', 0);
      return;
    }
    if (force || now - this.hostBeat > 1000) {
      this.hostBeat = now;
      this.sendState();
    }
  }
}
