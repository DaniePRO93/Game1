import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Room signaling: who is in the room (presence) plus a broadcast pipe used to
 * set up direct WebRTC links (and as a slow relay when a direct link fails).
 * Nothing here touches the database: Supabase Realtime channels are pure
 * websocket fan-out.
 */
export interface PeerMeta {
  id: string;
  name: string;
  /** ms since epoch when this peer joined; the earliest joiner hosts. */
  joinedAt: number;
}

export interface SignalMsg {
  from: string;
  /** Recipient, or undefined for everyone. */
  to?: string;
  k: string;
  [key: string]: unknown;
}

export interface Signal {
  readonly selfId: string;
  join(code: string, meta: PeerMeta): Promise<void>;
  send(msg: Omit<SignalMsg, 'from'>): void;
  onMessage: (msg: SignalMsg) => void;
  onPeers: (peers: PeerMeta[]) => void;
  leave(): void;
}

export function randomId(n = 8): string {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, (x) => a[x % a.length]).join('');
}

/** Supabase Realtime channel: presence for the player list, broadcast for messages. */
export class SupabaseSignal implements Signal {
  readonly selfId = randomId();
  onMessage: (msg: SignalMsg) => void = () => {};
  onPeers: (peers: PeerMeta[]) => void = () => {};
  private ch: RealtimeChannel | null = null;

  async join(code: string, meta: PeerMeta): Promise<void> {
    const { supabase } = await import('./backend');
    const ch = supabase.channel(`penstrike-room-${code}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: this.selfId } },
    });
    this.ch = ch;
    ch.on('broadcast', { event: 'm' }, ({ payload }) => {
      const m = payload as SignalMsg;
      if (m.to && m.to !== this.selfId) return;
      this.onMessage(m);
    });
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<PeerMeta>();
      const peers: PeerMeta[] = [];
      for (const list of Object.values(state)) {
        const p = list[0];
        if (p && p.id) peers.push({ id: p.id, name: p.name, joinedAt: p.joinedAt });
      }
      this.onPeers(peers);
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("couldn't reach the game server")), 12000);
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer);
          await ch.track({ ...meta, id: this.selfId });
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer);
          reject(new Error("couldn't reach the game server"));
        }
      });
    });
  }

  send(msg: Omit<SignalMsg, 'from'>): void {
    void this.ch?.send({ type: 'broadcast', event: 'm', payload: { ...msg, from: this.selfId } });
  }

  leave(): void {
    if (!this.ch) return;
    void this.ch.untrack();
    void this.ch.unsubscribe();
    this.ch = null;
  }
}

/**
 * Same-browser stand-in (BroadcastChannel between tabs), for local testing
 * with `?net=local`. Presence is emulated with heartbeats.
 */
export class LocalSignal implements Signal {
  readonly selfId = randomId();
  onMessage: (msg: SignalMsg) => void = () => {};
  onPeers: (peers: PeerMeta[]) => void = () => {};
  private bc: BroadcastChannel | null = null;
  private meta: PeerMeta | null = null;
  private seen = new Map<string, { meta: PeerMeta; at: number }>();
  private timer = 0;

  async join(code: string, meta: PeerMeta): Promise<void> {
    this.meta = { ...meta, id: this.selfId };
    this.bc = new BroadcastChannel(`penstrike-room-${code}`);
    this.bc.onmessage = (e) => {
      const m = e.data as SignalMsg;
      if (m.from === this.selfId) return;
      if (m.k === '_here') {
        const fresh = !this.seen.has(m.from);
        this.seen.set(m.from, { meta: m.meta as PeerMeta, at: performance.now() });
        if (fresh) {
          this.beat();
          this.emit();
        }
        return;
      }
      if (m.k === '_bye') {
        this.seen.delete(m.from);
        this.emit();
        return;
      }
      if (m.to && m.to !== this.selfId) return;
      this.onMessage(m);
    };
    this.beat();
    this.emit();
    this.timer = window.setInterval(() => {
      this.beat();
      const now = performance.now();
      let changed = false;
      for (const [id, s] of this.seen) {
        if (now - s.at > 3500) {
          this.seen.delete(id);
          changed = true;
        }
      }
      if (changed) this.emit();
    }, 1000);
  }

  private beat(): void {
    this.bc?.postMessage({ from: this.selfId, k: '_here', meta: this.meta });
  }

  private emit(): void {
    this.onPeers([this.meta!, ...Array.from(this.seen.values(), (s) => s.meta)]);
  }

  send(msg: Omit<SignalMsg, 'from'>): void {
    this.bc?.postMessage({ ...msg, from: this.selfId });
  }

  leave(): void {
    clearInterval(this.timer);
    this.bc?.postMessage({ from: this.selfId, k: '_bye' });
    this.bc?.close();
    this.bc = null;
  }
}
