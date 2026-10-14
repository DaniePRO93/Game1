import type { PeerMeta, Signal, SignalMsg } from './signal';

/**
 * Full mesh of direct WebRTC data channels between everyone in a room (2-4
 * players). Each pair gets a reliable channel (hits, deaths, votes) and an
 * unreliable one (positions). If a direct link can't be made (strict
 * networks), that peer falls back to relaying through the signal channel.
 */
export type NetMsg = { t: string } & Record<string, unknown>;

const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
const CONNECT_TIMEOUT = 8000;
/** Unreliable messages sent over the relay are thinned to this rate per peer. */
const RELAY_STATE_MS = 120;

interface Link {
  id: string;
  pc: RTCPeerConnection | null;
  r: RTCDataChannel | null;
  u: RTCDataChannel | null;
  relay: boolean;
  open: boolean;
  pendingIce: RTCIceCandidateInit[];
  timer: number;
  lastRelayState: number;
}

export class Mesh {
  onMessage: (from: string, msg: NetMsg) => void = () => {};
  /** A peer became reachable (direct or relay). */
  onOpen: (id: string) => void = () => {};
  onClose: (id: string) => void = () => {};
  private links = new Map<string, Link>();

  constructor(private signal: Signal) {
    signal.onMessage = (m) => void this.onSignal(m);
  }

  get selfId(): string {
    return this.signal.selfId;
  }

  /** Reconcile links with the current room roster. */
  setPeers(peers: PeerMeta[]): void {
    const ids = new Set(peers.map((p) => p.id).filter((id) => id !== this.selfId));
    for (const id of ids) if (!this.links.has(id)) this.connect(id);
    for (const id of Array.from(this.links.keys())) if (!ids.has(id)) this.drop(id);
  }

  isOpen(id: string): boolean {
    return !!this.links.get(id)?.open;
  }

  /** Is this peer on the slow relay path? (for the UI) */
  isRelayed(id: string): boolean {
    return !!this.links.get(id)?.relay;
  }

  send(to: string, msg: NetMsg, reliable: boolean): void {
    const l = this.links.get(to);
    if (!l || !l.open) return;
    if (l.relay) {
      if (!reliable) {
        const now = performance.now();
        if (now - l.lastRelayState < RELAY_STATE_MS) return;
        l.lastRelayState = now;
      }
      this.signal.send({ to, k: 'relay', m: msg });
      return;
    }
    const ch = reliable ? l.r : l.u;
    if (ch && ch.readyState === 'open') {
      try {
        ch.send(JSON.stringify(msg));
      } catch {
        /* channel closing */
      }
    }
  }

  broadcast(msg: NetMsg, reliable: boolean): void {
    for (const id of this.links.keys()) this.send(id, msg, reliable);
  }

  close(): void {
    for (const id of Array.from(this.links.keys())) this.drop(id);
  }

  private connect(id: string): void {
    const l: Link = { id, pc: null, r: null, u: null, relay: false, open: false, pendingIce: [], timer: 0, lastRelayState: 0 };
    this.links.set(id, l);
    const pc = new RTCPeerConnection({ iceServers: ICE });
    l.pc = pc;
    // Negotiated channels: both sides create them with fixed ids, no extra handshake.
    l.r = pc.createDataChannel('r', { negotiated: true, id: 0, ordered: true });
    l.u = pc.createDataChannel('u', { negotiated: true, id: 1, ordered: false, maxRetransmits: 0 });
    for (const ch of [l.r, l.u]) {
      ch.onmessage = (e) => {
        try {
          this.onMessage(id, JSON.parse(e.data as string));
        } catch {
          /* bad packet */
        }
      };
    }
    l.r.onopen = () => this.markOpen(l);
    l.r.onclose = () => {
      if (this.links.get(id) === l && !l.relay) this.drop(id);
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) this.signal.send({ to: id, k: 'ice', c: e.candidate.toJSON() });
    };
    // The lower id makes the offer, so both sides never offer at once.
    if (this.selfId < id) void this.offer(l);
    l.timer = window.setTimeout(() => {
      if (l.open) return;
      // No direct path: fall back to the relay for this peer.
      l.relay = true;
      this.signal.send({ to: id, k: 'relay-on' });
      this.markOpen(l);
    }, CONNECT_TIMEOUT);
  }

  private markOpen(l: Link): void {
    if (l.open) return;
    l.open = true;
    clearTimeout(l.timer);
    this.onOpen(l.id);
  }

  private async offer(l: Link): Promise<void> {
    const pc = l.pc!;
    await pc.setLocalDescription(await pc.createOffer());
    this.signal.send({ to: l.id, k: 'offer', sdp: pc.localDescription!.sdp });
  }

  private async onSignal(m: SignalMsg): Promise<void> {
    // An offer can beat the presence update that announces its sender.
    if (!this.links.has(m.from) && m.k === 'offer') this.connect(m.from);
    const l = this.links.get(m.from);
    if (m.k === 'relay') {
      if (l) {
        if (!l.relay) {
          // They can't reach us directly; mirror their choice.
          l.relay = true;
          this.markOpen(l);
        }
        this.onMessage(m.from, m.m as NetMsg);
      }
      return;
    }
    if (!l || !l.pc) return;
    const pc = l.pc;
    try {
      if (m.k === 'relay-on') {
        l.relay = true;
        this.markOpen(l);
      } else if (m.k === 'offer') {
        await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp as string });
        await pc.setLocalDescription(await pc.createAnswer());
        this.signal.send({ to: l.id, k: 'answer', sdp: pc.localDescription!.sdp });
        for (const c of l.pendingIce.splice(0)) await pc.addIceCandidate(c);
      } else if (m.k === 'answer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: m.sdp as string });
        for (const c of l.pendingIce.splice(0)) await pc.addIceCandidate(c);
      } else if (m.k === 'ice') {
        const c = m.c as RTCIceCandidateInit;
        if (pc.remoteDescription) await pc.addIceCandidate(c);
        else l.pendingIce.push(c);
      }
    } catch {
      /* negotiation hiccup: the timeout falls back to relay */
    }
  }

  private drop(id: string): void {
    const l = this.links.get(id);
    if (!l) return;
    this.links.delete(id);
    clearTimeout(l.timer);
    try {
      l.r?.close();
      l.u?.close();
      l.pc?.close();
    } catch {
      /* already closed */
    }
    if (l.open) this.onClose(id);
  }
}
