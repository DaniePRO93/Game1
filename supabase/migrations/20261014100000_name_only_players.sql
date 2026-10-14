-- Name-only identity: replaces the email/auth accounts from init_penstrike.
-- A player is just a name plus a random secret the browser generates and keeps
-- in localStorage. The server stores only sha256(secret). Every write goes
-- through a SECURITY DEFINER function that takes the secret; tables have RLS
-- on with no policies, so the API can't touch them directly.
--
-- Trade-off (deliberate): clearing browser storage loses the name. There is no
-- recovery, by design — nothing to verify, nothing to configure.

-- The old email-era tables are archived (renamed), not dropped. They were
-- empty; drop the legacy_* tables and the old functions from the dashboard
-- whenever convenient.
alter table public.monster_reports rename to legacy_monster_reports;
alter table public.monsters rename to legacy_monsters;
alter table public.scores rename to legacy_scores;
alter table public.profiles rename to legacy_profiles;
alter index public.monster_reports_pkey rename to legacy_monster_reports_pkey;
alter index public.monsters_pkey rename to legacy_monsters_pkey;
alter index public.monsters_recent_idx rename to legacy_monsters_recent_idx;
alter index public.scores_pkey rename to legacy_scores_pkey;
alter index public.scores_score_idx rename to legacy_scores_score_idx;
alter sequence public.monsters_id_seq rename to legacy_monsters_id_seq;
alter sequence public.scores_id_seq rename to legacy_scores_id_seq;
revoke execute on function public.claim_username(text) from authenticated;
revoke execute on function public.submit_score(int, int, int, int, int, boolean) from authenticated;
revoke execute on function public.publish_monster(text, text, text) from authenticated;
revoke execute on function public.report_monster(bigint) from authenticated;

create table public.players (
  id uuid primary key default gen_random_uuid(),
  username text not null check (username ~ '^[A-Za-z0-9_]{3,16}$'),
  secret_hash text not null unique,
  created_ip text,
  created_at timestamptz not null default now()
);
-- Case-insensitive uniqueness so "Dan" and "dan" can't both exist.
create unique index players_username_key on public.players (lower(username));
create index players_ip_idx on public.players (created_ip, created_at);

create table public.scores (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  score int not null check (score between 0 and 50000000),
  wave int not null check (wave between 1 and 1000),
  kills int not null check (kills between 0 and 1000000),
  best_combo int not null default 1 check (best_combo between 1 and 5),
  duration_s int not null check (duration_s between 0 and 86400),
  color_mode boolean not null default false,
  created_at timestamptz not null default now()
);
create index scores_score_idx on public.scores (score desc);
create index scores_player_idx on public.scores (player_id, created_at desc);

create table public.monsters (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  kind text not null check (kind in ('enemy', 'boss')),
  token text not null,
  name text check (name is null or char_length(name) <= 40),
  hidden boolean not null default false,
  report_count int not null default 0,
  created_ip text,
  created_at timestamptz not null default now(),
  -- Postgres regex repetition counts max out at 255; check length separately.
  constraint monsters_token_check check (token ~ '^[zr][A-Za-z0-9_-]+$' and char_length(token) between 3 and 16000)
);
create index monsters_recent_idx on public.monsters (created_at desc) where not hidden;
create index monsters_player_idx on public.monsters (player_id, created_at desc);
create index monsters_ip_idx on public.monsters (created_ip, created_at);

create table public.monster_reports (
  monster_id bigint not null references public.monsters(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (monster_id, player_id)
);

alter table public.players enable row level security;
alter table public.scores enable row level security;
alter table public.monsters enable row level security;
alter table public.monster_reports enable row level security;

-- ── helpers (not callable from the API) ────────────────────────────────
create function public._client_ip() returns text
language sql stable set search_path = '' as $$
  select btrim(split_part(coalesce(
    current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1));
$$;

create function public._hash(p_secret text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p_secret, 'sha256'), 'hex');
$$;

create function public._player(p_secret text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare pid uuid;
begin
  if p_secret is null or char_length(p_secret) < 32 then raise exception 'pick a name first'; end if;
  select id into pid from public.players where secret_hash = public._hash(p_secret);
  if pid is null then raise exception 'pick a name first'; end if;
  return pid;
end $$;

revoke execute on function public._client_ip() from public, anon, authenticated;
revoke execute on function public._hash(text) from public, anon, authenticated;
revoke execute on function public._player(text) from public, anon, authenticated;

-- ── RPCs ───────────────────────────────────────────────────────────────
-- Create a player, or rename the one that owns this secret.
create function public.claim_name(p_username text, p_secret text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  h text;
  ip text := public._client_ip();
begin
  if p_username !~ '^[A-Za-z0-9_]{3,16}$' then
    raise exception 'name must be 3-16 letters, numbers or _';
  end if;
  if p_secret is null or char_length(p_secret) < 32 or char_length(p_secret) > 200 then
    raise exception 'bad secret';
  end if;
  h := public._hash(p_secret);
  if exists (select 1 from public.players where secret_hash = h) then
    update public.players set username = p_username where secret_hash = h;
  else
    if ip <> '' and (select count(*) from public.players
                     where created_ip = ip and created_at > now() - interval '1 day') >= 5 then
      raise exception 'too many new names from here today';
    end if;
    insert into public.players (username, secret_hash, created_ip) values (p_username, h, nullif(ip, ''));
  end if;
  return p_username;
exception when unique_violation then
  raise exception 'that name is taken';
end $$;

-- Plausibility checks: not cheat-proof (the game runs client-side), but they
-- reject obviously fabricated runs and rate-limit submissions.
create function public.submit_score(
  p_secret text, p_score int, p_wave int, p_kills int, p_best_combo int, p_duration_s int, p_color_mode boolean
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := public._player(p_secret);
  new_id bigint;
begin
  if exists (select 1 from public.scores where player_id = pid and created_at > now() - interval '20 seconds') then
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
  insert into public.scores (player_id, score, wave, kills, best_combo, duration_s, color_mode)
  values (pid, p_score, p_wave, p_kills, p_best_combo, p_duration_s, p_color_mode)
  returning id into new_id;
  return new_id;
end $$;

create function public.publish_monster(p_secret text, p_kind text, p_token text, p_name text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := public._player(p_secret);
  ip text := public._client_ip();
  new_id bigint;
begin
  if (select count(*) from public.monsters where player_id = pid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'daily limit reached (10 monsters)';
  end if;
  if ip <> '' and (select count(*) from public.monsters
                   where created_ip = ip and created_at > now() - interval '1 day') >= 20 then
    raise exception 'daily limit reached for this network';
  end if;
  insert into public.monsters (player_id, kind, token, name, created_ip)
  values (pid, p_kind, p_token, nullif(btrim(p_name), ''), nullif(ip, ''))
  returning id into new_id;
  return new_id;
end $$;

-- 3 distinct reports hide a monster until reviewed in the dashboard
-- (set hidden = false there to restore it).
create function public.report_monster(p_secret text, p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := public._player(p_secret);
  n int;
begin
  insert into public.monster_reports (monster_id, player_id) values (p_id, pid) on conflict do nothing;
  select count(*) into n from public.monster_reports where monster_id = p_id;
  update public.monsters set report_count = n, hidden = hidden or n >= 3 where id = p_id;
end $$;

-- Best run per player.
create or replace function public.get_leaderboard(p_limit int default 10)
returns table (username text, score int, wave int, kills int, best_combo int, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.username, b.score, b.wave, b.kills, b.best_combo, b.created_at
  from (
    select distinct on (s.player_id) s.player_id, s.score, s.wave, s.kills, s.best_combo, s.created_at
    from public.scores s
    order by s.player_id, s.score desc, s.created_at asc
  ) b
  join public.players p on p.id = b.player_id
  order by b.score desc, b.created_at asc
  limit least(greatest(p_limit, 1), 100);
$$;

create function public.get_monsters(p_limit int default 12)
returns table (id bigint, kind text, token text, name text, created_at timestamptz, username text)
language sql stable security definer set search_path = '' as $$
  select m.id, m.kind, m.token, m.name, m.created_at, p.username
  from public.monsters m join public.players p on p.id = m.player_id
  where not m.hidden
  order by m.created_at desc
  limit least(greatest(p_limit, 1), 48);
$$;

create or replace function public.get_stats()
returns table (players bigint, runs bigint, monsters bigint)
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.players),
         (select count(*) from public.scores),
         (select count(*) from public.monsters where not hidden);
$$;

grant execute on function public.claim_name(text, text) to anon, authenticated;
grant execute on function public.submit_score(text, int, int, int, int, int, boolean) to anon, authenticated;
grant execute on function public.publish_monster(text, text, text, text) to anon, authenticated;
grant execute on function public.report_monster(text, bigint) to anon, authenticated;
grant execute on function public.get_leaderboard(int) to anon, authenticated;
grant execute on function public.get_monsters(int) to anon, authenticated;
grant execute on function public.get_stats() to anon, authenticated;
