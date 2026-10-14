-- Pen Strike backend (Supabase project "penstrike"). Applied via the Supabase
-- MCP; kept here as the source of truth. Run in order on a fresh project.

-- Profiles: one public username per account.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[A-Za-z0-9_]{3,16}$'),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles are public" on public.profiles for select using (true);

-- Scores: every submitted run.
create table public.scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  score int not null check (score between 0 and 50000000),
  wave int not null check (wave between 1 and 1000),
  kills int not null check (kills between 0 and 1000000),
  best_combo int not null default 1 check (best_combo between 1 and 5),
  duration_s int not null check (duration_s between 0 and 86400),
  color_mode boolean not null default false,
  created_at timestamptz not null default now()
);
create index scores_score_idx on public.scores (score desc);
create index scores_user_idx on public.scores (user_id, score desc);
alter table public.scores enable row level security;
create policy "scores are public" on public.scores for select using (true);

-- Monsters: published drawings (share-link token format).
create table public.monsters (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('enemy', 'boss')),
  token text not null,
  name text check (name is null or char_length(name) <= 40),
  hidden boolean not null default false,
  report_count int not null default 0,
  created_at timestamptz not null default now(),
  -- Postgres regex repetition counts max out at 255; check length separately.
  constraint monsters_token_check check (token ~ '^[zr][A-Za-z0-9_-]+$' and char_length(token) between 3 and 16000)
);
create index monsters_recent_idx on public.monsters (created_at desc) where not hidden;
create index monsters_user_idx on public.monsters (user_id, created_at desc);
alter table public.monsters enable row level security;
create policy "visible monsters are public" on public.monsters for select using (not hidden);

-- Reports: one per user per monster. No direct access; RPC only.
create table public.monster_reports (
  monster_id bigint not null references public.monsters(id) on delete cascade,
  reporter uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (monster_id, reporter)
);
alter table public.monster_reports enable row level security;

-- ── RPCs (all writes go through these) ─────────────────────────────────
create function public.claim_username(p_username text)
returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare r public.profiles;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_username !~ '^[A-Za-z0-9_]{3,16}$' then
    raise exception 'username must be 3-16 letters, numbers or _';
  end if;
  insert into public.profiles (id, username) values (auth.uid(), p_username)
  on conflict (id) do update set username = excluded.username
  returning * into r;
  return r;
exception when unique_violation then
  raise exception 'that username is taken';
end $$;

-- Plausibility checks: not cheat-proof (the game runs client-side), but they
-- reject obviously fabricated runs and rate-limit submissions.
create function public.submit_score(
  p_score int, p_wave int, p_kills int, p_best_combo int, p_duration_s int, p_color_mode boolean
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  new_id bigint;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'pick a username first';
  end if;
  if exists (select 1 from public.scores where user_id = uid and created_at > now() - interval '20 seconds') then
    raise exception 'slow down a little';
  end if;
  if p_wave < 1 or p_kills < 0 or p_score < 0 or p_best_combo not between 1 and 5 then
    raise exception 'invalid run';
  end if;
  if p_duration_s < (p_wave - 1) * 8 then
    raise exception 'run too short for that wave';
  end if;
  if p_kills > p_wave * (6 + 3 * p_wave) + 10 then
    raise exception 'too many kills for that wave';
  end if;
  if p_score::bigint > p_kills::bigint * 250 + (p_wave / 5) * 4000 + p_wave::bigint * p_wave * (400 + 40 * p_wave) then
    raise exception 'score too high for that run';
  end if;
  insert into public.scores (user_id, score, wave, kills, best_combo, duration_s, color_mode)
  values (uid, p_score, p_wave, p_kills, p_best_combo, p_duration_s, p_color_mode)
  returning id into new_id;
  return new_id;
end $$;

create function public.publish_monster(p_kind text, p_token text, p_name text)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  new_id bigint;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'pick a username first';
  end if;
  if (select count(*) from public.monsters where user_id = uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'daily limit reached (10 monsters)';
  end if;
  insert into public.monsters (user_id, kind, token, name)
  values (uid, p_kind, p_token, nullif(btrim(p_name), ''))
  returning id into new_id;
  return new_id;
end $$;

-- 3 distinct reports hide a monster until reviewed in the dashboard
-- (set hidden = false there to restore it).
create function public.report_monster(p_id bigint)
returns void
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'sign in to report'; end if;
  insert into public.monster_reports (monster_id, reporter) values (p_id, auth.uid())
  on conflict do nothing;
  select count(*) into n from public.monster_reports where monster_id = p_id;
  update public.monsters set report_count = n, hidden = hidden or n >= 3 where id = p_id;
end $$;

-- Best run per player. Invoker rights: tables are public-read via RLS.
create function public.get_leaderboard(p_limit int default 10)
returns table (username text, score int, wave int, kills int, best_combo int, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select p.username, b.score, b.wave, b.kills, b.best_combo, b.created_at
  from (
    select distinct on (s.user_id) s.user_id, s.score, s.wave, s.kills, s.best_combo, s.created_at
    from public.scores s
    order by s.user_id, s.score desc, s.created_at asc
  ) b
  join public.profiles p on p.id = b.user_id
  order by b.score desc, b.created_at asc
  limit least(greatest(p_limit, 1), 100);
$$;

create function public.get_stats()
returns table (players bigint, runs bigint, monsters bigint)
language sql stable security invoker set search_path = '' as $$
  select (select count(*) from public.profiles),
         (select count(*) from public.scores),
         (select count(*) from public.monsters where not hidden);
$$;

-- Writes: signed-in users only (functions default to EXECUTE for PUBLIC).
revoke execute on function public.claim_username(text) from public, anon;
revoke execute on function public.submit_score(int, int, int, int, int, boolean) from public, anon;
revoke execute on function public.publish_monster(text, text, text) from public, anon;
revoke execute on function public.report_monster(bigint) from public, anon;
grant execute on function public.claim_username(text) to authenticated;
grant execute on function public.submit_score(int, int, int, int, int, boolean) to authenticated;
grant execute on function public.publish_monster(text, text, text) to authenticated;
grant execute on function public.report_monster(bigint) to authenticated;
