import { createClient } from '@supabase/supabase-js';

/**
 * Supabase backend: player names, leaderboard, monster gallery.
 * The publishable key is meant to be public; all access is enforced by
 * the RPC functions in supabase/migrations (tables have no direct access).
 */
const SUPABASE_URL = 'https://lyzktwgegfujkyilpfev.supabase.co';
const SUPABASE_KEY = 'sb_publishable_40eweFsdbCLQr6QP7TvtPw_ffB4EfDq';

// No Supabase Auth: a player is a name plus a random secret kept in this
// browser. The server only stores a hash of the secret (see
// supabase/migrations/*_name_only_players.sql).
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const ID_KEY = 'penstrike.player.v1';

export interface Account {
  username: string | null;
}

interface StoredId {
  secret: string;
  username: string | null;
}

function load(): StoredId | null {
  try {
    const v = JSON.parse(localStorage.getItem(ID_KEY) ?? 'null') as StoredId | null;
    return v && typeof v.secret === 'string' && v.secret.length >= 32 ? v : null;
  } catch {
    return null;
  }
}

function save(v: StoredId): void {
  try {
    localStorage.setItem(ID_KEY, JSON.stringify(v));
  } catch {
    /* private mode: the name lasts for this page only */
  }
}

let id: StoredId | null = load();

function secret(): string {
  if (!id) {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const s = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    id = { secret: s, username: null };
    save(id);
  }
  return id.secret;
}

export interface LeaderRow {
  username: string;
  score: number;
  wave: number;
  kills: number;
  best_combo: number;
  created_at: string;
}

export interface MonsterRow {
  id: number;
  kind: 'enemy' | 'boss';
  token: string;
  name: string | null;
  created_at: string;
  username: string;
}

export interface RunResult {
  score: number;
  wave: number;
  kills: number;
  bestCombo: number;
  durationS: number;
  colorMode: boolean;
}

/** Turn Postgres/Supabase errors into a short message for the UI. */
function msg(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  return m.slice(0, 160);
}

async function call<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(msg(error));
  return data;
}

export function getAccount(): Account {
  return { username: id?.username ?? null };
}

/** Pick (or change) the name this browser plays under. */
export async function claimName(name: string): Promise<string> {
  const username = (await call(supabase.rpc('claim_name', { p_username: name, p_secret: secret() }))) as string;
  id = { secret: secret(), username };
  save(id);
  return username;
}

export async function submitScore(r: RunResult): Promise<void> {
  await call(
    supabase.rpc('submit_score', {
      p_secret: secret(),
      p_score: Math.round(r.score),
      p_wave: r.wave,
      p_kills: r.kills,
      p_best_combo: Math.min(5, Math.max(1, r.bestCombo)),
      p_duration_s: Math.round(r.durationS),
      p_color_mode: r.colorMode,
    }),
  );
}

export async function getLeaderboard(limit = 10): Promise<LeaderRow[]> {
  return (await call(supabase.rpc('get_leaderboard', { p_limit: limit }))) as LeaderRow[];
}

export async function getStats(): Promise<{ players: number; runs: number; monsters: number }> {
  const rows = (await call(supabase.rpc('get_stats'))) as { players: number; runs: number; monsters: number }[];
  return rows[0] ?? { players: 0, runs: 0, monsters: 0 };
}

export async function publishMonster(kind: 'enemy' | 'boss', token: string, name: string): Promise<number> {
  return (await call(supabase.rpc('publish_monster', { p_secret: secret(), p_kind: kind, p_token: token, p_name: name }))) as number;
}

export async function recentMonsters(limit = 12): Promise<MonsterRow[]> {
  return (await call(supabase.rpc('get_monsters', { p_limit: limit }))) as MonsterRow[];
}

export async function reportMonster(monsterId: number): Promise<void> {
  await call(supabase.rpc('report_monster', { p_secret: secret(), p_id: monsterId }));
}
