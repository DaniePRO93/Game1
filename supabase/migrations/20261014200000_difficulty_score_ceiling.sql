-- Solo difficulty: hard multiplies score by 1.5, so the plausibility ceiling
-- in submit_score grows by the same factor. Everything else is unchanged.
create or replace function public.submit_score(
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
  if p_score::bigint * 2 > 3 * (p_kills::bigint * 250 + (p_wave / 5) * 4000 + p_wave::bigint * p_wave * (400 + 40 * p_wave)) then
    raise exception 'score too high for that run';
  end if;
  insert into public.scores (player_id, score, wave, kills, best_combo, duration_s, color_mode)
  values (pid, p_score, p_wave, p_kills, p_best_combo, p_duration_s, p_color_mode)
  returning id into new_id;
  return new_id;
end $$;
