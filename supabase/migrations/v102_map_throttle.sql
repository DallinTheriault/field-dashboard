-- v102: every map service waits its turn, and routing is Valhalla only.
--
-- The public services' terms allow at most one request a second from the
-- whole app (Nominatim's usage policy; FOSSGIS for Valhalla). v101 spaced
-- Nominatim only; now the Census geocoder and Valhalla take slots too, each
-- service on its own row, shared by every server.
--
-- A caller says how long it can wait (p_max_wait_ms). When the next free slot
-- is further off than that, it gets -1 and no slot is taken, so a request
-- with a time budget never waits past it; the lookup is left for the next
-- batch.
--
-- The OSRM backup is gone (its demo server is for non-commercial use only),
-- so a cached route can only have come from Valhalla.

insert into public.geo_throttle (service) values ('census'), ('valhalla')
on conflict (service) do nothing;

drop function public.geo_throttle_slot(text, integer);

create function public.geo_throttle_slot(p_service text, p_gap_ms integer, p_max_wait_ms integer default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cur  timestamptz;
  wait integer;
begin
  select next_at into cur from public.geo_throttle where service = p_service for update;
  if not found then
    raise exception 'unknown service %', p_service;
  end if;
  wait := greatest(0, ceil(extract(epoch from (cur - clock_timestamp())) * 1000))::integer;
  if p_max_wait_ms is not null and wait > p_max_wait_ms then
    return -1; -- no slot in time; none taken
  end if;
  update public.geo_throttle
     set next_at = greatest(cur, clock_timestamp()) + make_interval(secs => p_gap_ms / 1000.0)
   where service = p_service;
  -- Milliseconds to wait before sending.
  return wait;
end;
$$;
revoke execute on function public.geo_throttle_slot(text, integer, integer) from public, anon, authenticated;
grant execute on function public.geo_throttle_slot(text, integer, integer) to service_role;

alter table public.route_cache
  drop constraint route_cache_source_check,
  add constraint route_cache_source_check check (source = 'valhalla');
