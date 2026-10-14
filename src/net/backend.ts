import { createClient, type Session } from '@supabase/supabase-js';

/**
 * Supabase backend: accounts (email magic link), leaderboard, monster gallery.
 * The publishable key is meant to be public; all access is enforced by
 * row-level security and the RPC functions in supabase/migrations.
 */
const SUPABASE_URL = 'https://lyzktwgegfujkyilpfev.supabase.co';
const SUPABASE_KEY = 'sb_publishable_40eweFsdbCLQr6QP7TvtPw_ffB4EfDq';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});

export interface Account {
  session: Session | null;
  username: string | null;
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

export async function getAccount(): Promise<Account> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return { session: null, username: null };
  const { data: prof } = await supabase.from('profiles').select('username').eq('id', session.user.id).maybeSingle();
  return { session, username: prof?.username ?? null };
}

export function onAuthChange(cb: () => void): void {
  supabase.auth.onAuthStateChange(() => cb());
}

/** Email a magic sign-in link that returns to the current page. */
export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${location.origin}${location.pathname}` },
  });
  if (error) throw new Error(msg(error));
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function claimUsername(name: string): Promise<string> {
  const row = await call(supabase.rpc('claim_username', { p_username: name }));
  return (row as { username: string }).username;
}

export async function submitScore(r: RunResult): Promise<void> {
  await call(
    supabase.rpc('submit_score', {
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
  return (await call(supabase.rpc('publish_monster', { p_kind: kind, p_token: token, p_name: name }))) as number;
}

export async function recentMonsters(limit = 12): Promise<MonsterRow[]> {
  const rows = (await call(
    supabase
      .from('monsters')
      .select('id, kind, token, name, created_at, profiles(username)')
      .order('created_at', { ascending: false })
      .limit(limit),
  )) as unknown as (Omit<MonsterRow, 'username'> & { profiles: { username: string } | null })[];
  return rows.map((r) => ({ ...r, username: r.profiles?.username ?? 'someone' }));
}

export async function reportMonster(id: number): Promise<void> {
  await call(supabase.rpc('report_monster', { p_id: id }));
}

// A run finished while signed out is kept so it can be posted after the
// magic-link round trip (which reloads the page).
const PENDING_KEY = 'doodle-fps.pending-run.v1';

export function savePendingRun(r: RunResult): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ ...r, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function takePendingRun(): RunResult | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    localStorage.removeItem(PENDING_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as RunResult & { at: number };
    return Date.now() - r.at < 2 * 3600 * 1000 ? r : null;
  } catch {
    return null;
  }
}

export function peekPendingRun(): boolean {
  try {
    return !!localStorage.getItem(PENDING_KEY);
  } catch {
    return false;
  }
}
