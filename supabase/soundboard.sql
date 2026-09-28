-- ===================================================================
-- THE BIG FAT SOUNDBOARD — online opslag in Supabase (voorvoegsel sb_)
--
-- Er is geen inlog. Toegang loopt via geheime sleutels:
--   * de persoonlijke sleutel ("ik"): wie hem heeft, is die persoon
--   * de SPEEL- en de BEWERK-link van een bord
--   * een uitnodigingscode, waarmee je een persoonlijke sleutel krijgt
-- Van persoonlijke sleutels bewaren we alleen een sha256-hash.
--
-- De tabellen zijn dicht voor anon en authenticated. Alles loopt via de
-- functies hieronder (security definer), die de sleutels controleren.
-- Een fout met code PTxyz komt bij de app aan als HTTP-status xyz.
--
-- Geluiden staan in de bucket 'soundboard' (publiek te lezen, maar met
-- onraadbare namen). Uploaden mag alleen naar een pad dat vooraf via
-- sb_upload_ticket is vrijgegeven.
-- ===================================================================

-- ---------- tabellen -------------------------------------------------

create table if not exists public.sb_people (
  id          uuid primary key default gen_random_uuid(),
  secret_hash text not null unique,
  name        text not null default '',
  is_admin    boolean not null default false,
  quota_mb    integer not null default 200,
  invited_by  uuid references public.sb_people(id) on delete set null,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz
);

create table if not exists public.sb_invites (
  code        text primary key,
  created_by  uuid not null references public.sb_people(id) on delete cascade,
  note        text not null default '',
  uses_left   integer not null default 1,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.sb_sounds (
  id          text primary key,
  owner       uuid not null references public.sb_people(id) on delete cascade,
  kind        text not null default 'audio' check (kind in ('audio', 'video')),
  path        text not null unique,
  label       text not null default '',
  icon        text not null default 'wave',
  color       text,
  gain_db     real not null default 0,
  duration    real not null default 0,
  peaks       smallint[],
  stream      boolean not null default false,
  w           integer,
  h           integer,
  size_bytes  bigint not null default 0,
  shared      boolean not null default false,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists sb_sounds_owner on public.sb_sounds (owner);
create index if not exists sb_sounds_shared on public.sb_sounds (shared) where deleted_at is null;

create table if not exists public.sb_boards (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references public.sb_people(id) on delete cascade,
  title       text not null default 'NIEUW BORD',
  doc         jsonb not null default '{}'::jsonb,
  version     integer not null default 1,
  play_token  text not null unique,
  edit_token  text not null unique,
  updated_by  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists sb_boards_owner on public.sb_boards (owner);

create table if not exists public.sb_board_members (
  board_id    uuid not null references public.sb_boards(id) on delete cascade,
  person_id   uuid not null references public.sb_people(id) on delete cascade,
  role        text not null check (role in ('play', 'edit')),
  added_at    timestamptz not null default now(),
  primary key (board_id, person_id)
);
create index if not exists sb_board_members_person on public.sb_board_members (person_id);

create table if not exists public.sb_board_sounds (
  board_id    uuid not null references public.sb_boards(id) on delete cascade,
  sound_id    text not null references public.sb_sounds(id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (board_id, sound_id)
);
create index if not exists sb_board_sounds_sound on public.sb_board_sounds (sound_id);

create table if not exists public.sb_uploads (
  path        text primary key,
  owner       uuid not null references public.sb_people(id) on delete cascade,
  board_id    uuid references public.sb_boards(id) on delete cascade,
  kind        text not null default 'audio',
  max_bytes   bigint not null,
  expires_at  timestamptz not null,
  done        boolean not null default false
);
create index if not exists sb_uploads_owner on public.sb_uploads (owner);
create index if not exists sb_uploads_board on public.sb_uploads (board_id);

alter table public.sb_people        enable row level security;
alter table public.sb_invites       enable row level security;
alter table public.sb_sounds        enable row level security;
alter table public.sb_boards        enable row level security;
alter table public.sb_board_members enable row level security;
alter table public.sb_board_sounds  enable row level security;
alter table public.sb_uploads       enable row level security;

revoke all on public.sb_people, public.sb_invites, public.sb_sounds, public.sb_boards,
  public.sb_board_members, public.sb_board_sounds, public.sb_uploads
  from anon, authenticated;

-- ---------- hulpfuncties (niet van buitenaf aan te roepen) -----------

-- n willekeurige bytes als url-veilige tekst (a-z A-Z 0-9 - _)
create or replace function public.sb_rand(n integer)
returns text language sql volatile set search_path = '' as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(n), 'base64'), '='), '+/', '-_');
$$;

create or replace function public.sb_hash(t text)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(coalesce(t, ''), 'sha256'), 'hex');
$$;

-- wie hoort bij deze persoonlijke sleutel?
create or replace function public.sb_who(p_ik text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.sb_people
  where p_ik is not null and length(p_ik) >= 20 and secret_hash = public.sb_hash(p_ik);
$$;

-- wat mag de beller met dit bord: 'owner', 'edit', 'play' of niets (null)
create or replace function public.sb_access(p_board uuid, p_ik text, p_token text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_b   public.sb_boards;
  v_me  uuid := public.sb_who(p_ik);
  v_rol text;
begin
  select * into v_b from public.sb_boards where id = p_board;
  if not found then return null; end if;
  if v_me is not null and v_b.owner = v_me then return 'owner'; end if;
  if p_token is not null and p_token = v_b.edit_token then return 'edit'; end if;
  if v_me is not null then
    select role into v_rol from public.sb_board_members where board_id = v_b.id and person_id = v_me;
    if v_rol = 'edit' then return 'edit'; end if;
  end if;
  if p_token is not null and p_token = v_b.play_token then return 'play'; end if;
  if v_rol = 'play' then return 'play'; end if;
  return null;
end $$;

-- een geluid zoals de app het wil hebben
create or replace function public.sb_def(s public.sb_sounds, p_me uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', s.id, 'kind', s.kind, 'path', s.path, 'label', s.label, 'icon', s.icon,
    'color', s.color, 'gainDb', s.gain_db, 'duration', s.duration,
    'peaks', to_jsonb(s.peaks), 'stream', s.stream, 'w', s.w, 'h', s.h,
    'size', s.size_bytes, 'shared', s.shared,
    'mine', (p_me is not null and s.owner = p_me),
    'deleted', case when s.deleted_at is not null then true end));
$$;

-- een bord zoals de app het wil hebben, met de geluiden die erop mogen
create or replace function public.sb_board_json(b public.sb_boards, p_rol text, p_me uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'title', b.title, 'doc', b.doc, 'version', b.version, 'role', p_rol,
    'updatedBy', b.updated_by, 'updatedAt', b.updated_at,
    'owner', (select name from public.sb_people where id = b.owner),
    'playToken', b.play_token,
    'editToken', case when p_rol in ('owner', 'edit') then b.edit_token end,
    'sounds', coalesce((
      select jsonb_agg(public.sb_def(s, p_me) order by s.id)
      from public.sb_board_sounds bs join public.sb_sounds s on s.id = bs.sound_id
      where bs.board_id = b.id), '[]'::jsonb));
$$;

-- ---------- personen en uitnodigingen --------------------------------

-- Aanmelden met een uitnodiging. Geeft de persoonlijke sleutel terug:
-- dat is de enige keer dat hij bestaat, daarna alleen nog als hash.
create or replace function public.sb_join(p_code text, p_name text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_inv    public.sb_invites;
  v_geheim text;
  v_id     uuid;
  v_naam   text := upper(left(trim(coalesce(p_name, '')), 30));
begin
  select * into v_inv from public.sb_invites where code = p_code for update;
  if not found or v_inv.uses_left < 1 or (v_inv.expires_at is not null and v_inv.expires_at < now()) then
    raise exception 'Deze uitnodiging is niet (meer) geldig.' using errcode = 'PT404';
  end if;
  if v_naam = '' then raise exception 'Vul je naam in.' using errcode = 'PT400'; end if;
  v_geheim := public.sb_rand(24);
  insert into public.sb_people (secret_hash, name, invited_by)
    values (public.sb_hash(v_geheim), v_naam, v_inv.created_by) returning id into v_id;
  update public.sb_invites set uses_left = uses_left - 1 where code = p_code;
  return jsonb_build_object('id', v_id, 'secret', v_geheim, 'name', v_naam, 'admin', false);
end $$;

create or replace function public.sb_me(p_ik text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_p    public.sb_people;
  v_used bigint;
begin
  select * into v_p from public.sb_people where id = public.sb_who(p_ik);
  if not found then return null; end if;
  update public.sb_people set last_seen = now() where id = v_p.id;
  select coalesce(sum(size_bytes), 0) into v_used
    from public.sb_sounds where owner = v_p.id and deleted_at is null;
  return jsonb_build_object('id', v_p.id, 'name', v_p.name, 'admin', v_p.is_admin,
                            'quotaMb', v_p.quota_mb, 'usedBytes', v_used);
end $$;

create or replace function public.sb_rename_me(p_ik text, p_name text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me   uuid := public.sb_who(p_ik);
  v_naam text := upper(left(trim(coalesce(p_name, '')), 30));
begin
  if v_me is null then raise exception 'Onbekende persoonlijke link.' using errcode = 'PT403'; end if;
  if v_naam = '' then raise exception 'Vul je naam in.' using errcode = 'PT400'; end if;
  update public.sb_people set name = v_naam where id = v_me;
  return public.sb_me(p_ik);
end $$;

-- Een uitnodigingslink maken. Alleen de beheerder.
create or replace function public.sb_invite_create(p_ik text, p_note text default '', p_uses integer default 1)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me   uuid := public.sb_who(p_ik);
  v_code text := public.sb_rand(9);
begin
  if v_me is null or not (select is_admin from public.sb_people where id = v_me) then
    raise exception 'Alleen de beheerder kan mensen uitnodigen.' using errcode = 'PT403';
  end if;
  insert into public.sb_invites (code, created_by, note, uses_left, expires_at)
    values (v_code, v_me, left(coalesce(p_note, ''), 60), greatest(1, least(coalesce(p_uses, 1), 50)),
            now() + interval '30 days');
  return jsonb_build_object('code', v_code);
end $$;

-- Overzicht voor de beheerder: wie er meedoen, wat ze gebruiken, open uitnodigingen.
create or replace function public.sb_admin_overview(p_ik text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := public.sb_who(p_ik);
begin
  if v_me is null or not (select is_admin from public.sb_people where id = v_me) then
    raise exception 'Alleen voor de beheerder.' using errcode = 'PT403';
  end if;
  return jsonb_build_object(
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', p.name, 'admin', p.is_admin, 'createdAt', p.created_at, 'lastSeen', p.last_seen,
        'sounds', (select count(*) from public.sb_sounds s where s.owner = p.id and s.deleted_at is null),
        'bytes', (select coalesce(sum(size_bytes), 0) from public.sb_sounds s where s.owner = p.id and s.deleted_at is null),
        'boards', (select count(*) from public.sb_boards b where b.owner = p.id)
      ) order by p.created_at) from public.sb_people p), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('code', i.code, 'note', i.note, 'usesLeft', i.uses_left,
                                          'expiresAt', i.expires_at) order by i.created_at desc)
      from public.sb_invites i
      where i.uses_left > 0 and (i.expires_at is null or i.expires_at > now())), '[]'::jsonb),
    'totalBytes', (select coalesce(sum(size_bytes), 0) from public.sb_sounds where deleted_at is null));
end $$;

-- ---------- borden -------------------------------------------------------

-- De borden van deze persoon: eigen borden en borden die hij via een link opende.
create or replace function public.sb_boards_list(p_ik text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := public.sb_who(p_ik);
begin
  if v_me is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'version', x.version,
                                        'updatedAt', x.updated_at, 'role', x.role)
                     order by x.updated_at desc)
    from (
      select b.id, b.title, b.version, b.updated_at, 'owner'::text as role
        from public.sb_boards b where b.owner = v_me
      union all
      select b.id, b.title, b.version, b.updated_at, m.role
        from public.sb_board_members m join public.sb_boards b on b.id = m.board_id
       where m.person_id = v_me and b.owner <> v_me
    ) x), '[]'::jsonb);
end $$;

create or replace function public.sb_board_create(p_ik text, p_title text, p_doc jsonb, p_sounds text[] default '{}')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me    uuid := public.sb_who(p_ik);
  v_b     public.sb_boards;
  v_doc   jsonb := p_doc;
  v_titel text;
begin
  if v_me is null then
    raise exception 'Voor een eigen bord heb je een persoonlijke link nodig.' using errcode = 'PT403';
  end if;
  if v_doc is null or jsonb_typeof(v_doc) <> 'object' then v_doc := '{}'::jsonb; end if;
  if pg_column_size(v_doc) > 524288 then
    raise exception 'Dit bord is te groot.' using errcode = 'PT400';
  end if;
  v_titel := upper(left(trim(coalesce(nullif(trim(p_title), ''), v_doc->>'title', 'NIEUW BORD')), 40));
  v_doc := jsonb_set(v_doc - 'masterVolume', '{title}', to_jsonb(v_titel), true);
  insert into public.sb_boards (owner, title, doc, play_token, edit_token, updated_by)
    values (v_me, v_titel, v_doc, public.sb_rand(12), public.sb_rand(12),
            (select name from public.sb_people where id = v_me))
    returning * into v_b;
  insert into public.sb_board_sounds (board_id, sound_id)
    select v_b.id, s.id from public.sb_sounds s
     where s.id = any(coalesce(p_sounds, '{}')) and s.deleted_at is null
       and (s.owner = v_me or s.shared)
    on conflict do nothing;
  return public.sb_board_json(v_b, 'owner', v_me);
end $$;

-- Een bord openen, met je persoonlijke sleutel en/of een link. Wie een
-- link opent terwijl hij een persoonlijke sleutel heeft, krijgt het bord
-- ook in zijn eigen lijst (op al zijn toestellen).
create or replace function public.sb_board_get(p_ik text default null, p_token text default null, p_board uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me  uuid := public.sb_who(p_ik);
  v_b   public.sb_boards;
  v_rol text;
  v_tok text;
begin
  if p_board is null then
    select * into v_b from public.sb_boards
     where p_token is not null and (play_token = p_token or edit_token = p_token);
  else
    select * into v_b from public.sb_boards where id = p_board;
  end if;
  if not found then
    raise exception 'Dit bord bestaat niet meer, of de link is ingetrokken.' using errcode = 'PT404';
  end if;
  v_rol := public.sb_access(v_b.id, p_ik, p_token);
  if v_rol is null then
    raise exception 'Geen toegang meer tot dit bord: de link is ingetrokken.' using errcode = 'PT403';
  end if;
  if v_me is not null and v_rol in ('edit', 'play') and p_token is not null then
    v_tok := case when p_token = v_b.edit_token then 'edit' when p_token = v_b.play_token then 'play' end;
    if v_tok is not null then
      insert into public.sb_board_members (board_id, person_id, role) values (v_b.id, v_me, v_tok)
      on conflict (board_id, person_id) do update
        set role = case when public.sb_board_members.role = 'edit' then 'edit' else excluded.role end;
    end if;
  end if;
  return public.sb_board_json(v_b, v_rol, v_me);
end $$;

-- Welke versie heeft een bord nu? Om te zien of er iets veranderd is.
create or replace function public.sb_board_version(p_ik text default null, p_token text default null, p_board uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_b public.sb_boards;
begin
  if public.sb_access(p_board, p_ik, p_token) is null then
    return jsonb_build_object('gone', true);
  end if;
  select * into v_b from public.sb_boards where id = p_board;
  return jsonb_build_object('version', v_b.version, 'updatedBy', v_b.updated_by,
                            'updatedAt', v_b.updated_at, 'title', v_b.title);
end $$;

-- Wijzigingen doorvoeren. Een wijziging is { p: [sleutel] , v: waarde },
-- of { p: ['sounds', id], v: {...} } voor één knop, of met d: true om iets
-- weg te halen. Zo overschrijven twee mensen die tegelijk bewerken elkaar
-- alleen als ze precies hetzelfde aanpassen.
create or replace function public.sb_board_patch(p_ik text, p_token text, p_board uuid, p_ops jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me   uuid := public.sb_who(p_ik);
  v_rol  text := public.sb_access(p_board, p_ik, p_token);
  v_doc  jsonb;
  v_oud  integer;
  v_nieuw integer;
  v_op   jsonb;
  v_pad  text[];
  v_wie  text;
  v_mag  text[] := array['title', 'font', 'fontScale', 'palette', 'fill', 'border', 'gap',
                         'radius', 'size', 'columns', 'fade', 'duck', 'timerTarget',
                         'showLabels', 'order', 'archived', 'clones', 'sounds'];
begin
  if v_rol is null or v_rol = 'play' then
    raise exception 'Je kunt dit bord niet bewerken.' using errcode = 'PT403';
  end if;
  if p_ops is null or jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) > 1000 then
    raise exception 'Ongeldige wijziging.' using errcode = 'PT400';
  end if;
  select doc, version into v_doc, v_oud from public.sb_boards where id = p_board for update;

  for v_op in select value from jsonb_array_elements(p_ops) loop
    select array_agg(x) into v_pad from jsonb_array_elements_text(v_op->'p') x;
    if v_pad is null or array_length(v_pad, 1) not between 1 and 2
       or not (v_pad[1] = any(v_mag))
       or (array_length(v_pad, 1) = 2 and v_pad[1] <> 'sounds') then
      raise exception 'Ongeldige wijziging: %', v_op->'p' using errcode = 'PT400';
    end if;
    if coalesce((v_op->>'d')::boolean, false) then
      v_doc := v_doc #- v_pad;
    else
      if array_length(v_pad, 1) = 2 and jsonb_typeof(v_doc->'sounds') is distinct from 'object' then
        v_doc := jsonb_set(v_doc, '{sounds}', '{}'::jsonb, true);
      end if;
      v_doc := jsonb_set(v_doc, v_pad, coalesce(v_op->'v', 'null'::jsonb), true);
    end if;
  end loop;

  if pg_column_size(v_doc) > 524288 then
    raise exception 'Dit bord wordt te groot.' using errcode = 'PT400';
  end if;
  v_wie := coalesce((select name from public.sb_people where id = v_me), 'IEMAND MET DE BEWERK-LINK');
  update public.sb_boards
     set doc = v_doc,
         title = upper(left(coalesce(nullif(trim(v_doc->>'title'), ''), title), 40)),
         version = version + 1, updated_by = v_wie, updated_at = now()
   where id = p_board
  returning version into v_nieuw;
  return jsonb_build_object('version', v_nieuw, 'before', v_oud);
end $$;

-- Een geluid uit de bibliotheek op een bord zetten.
create or replace function public.sb_board_add_sound(p_ik text, p_token text, p_board uuid, p_sound text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me  uuid := public.sb_who(p_ik);
  v_rol text := public.sb_access(p_board, p_ik, p_token);
  v_s   public.sb_sounds;
begin
  if v_rol is null or v_rol = 'play' then
    raise exception 'Je kunt dit bord niet bewerken.' using errcode = 'PT403';
  end if;
  select * into v_s from public.sb_sounds where id = p_sound and deleted_at is null;
  if not found then raise exception 'Dit geluid bestaat niet meer.' using errcode = 'PT404'; end if;
  if not ((v_me is not null and v_s.owner = v_me) or v_s.shared
          or exists (select 1 from public.sb_board_sounds where board_id = p_board and sound_id = p_sound)) then
    raise exception 'Dit geluid is privé.' using errcode = 'PT403';
  end if;
  insert into public.sb_board_sounds (board_id, sound_id) values (p_board, p_sound)
    on conflict do nothing;
  return public.sb_def(v_s, v_me);
end $$;

-- Een eigen kopie van een bord (als sjabloon). Privé-geluiden van een
-- ander gaan niet mee; de app haalt die knoppen al uit p_doc.
create or replace function public.sb_board_copy(p_ik text, p_token text, p_board uuid, p_title text, p_doc jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me  uuid := public.sb_who(p_ik);
  v_rol text := public.sb_access(p_board, p_ik, p_token);
  v_nieuw jsonb;
begin
  if v_me is null then
    raise exception 'Voor een eigen kopie heb je een persoonlijke link nodig.' using errcode = 'PT403';
  end if;
  if v_rol is null then
    raise exception 'Geen toegang tot dit bord.' using errcode = 'PT403';
  end if;
  v_nieuw := public.sb_board_create(p_ik, p_title, p_doc, '{}');
  insert into public.sb_board_sounds (board_id, sound_id)
    select (v_nieuw->>'id')::uuid, s.id
      from public.sb_board_sounds bs join public.sb_sounds s on s.id = bs.sound_id
     where bs.board_id = p_board and (s.owner = v_me or s.shared)
    on conflict do nothing;
  return public.sb_board_json((select b from public.sb_boards b where b.id = (v_nieuw->>'id')::uuid), 'owner', v_me);
end $$;

-- Een link intrekken en vervangen. Wie het bord via die link had, raakt
-- het kwijt tot hij de nieuwe link krijgt.
create or replace function public.sb_board_rotate(p_ik text, p_board uuid, p_which text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_b public.sb_boards;
begin
  if public.sb_access(p_board, p_ik, null) is distinct from 'owner' then
    raise exception 'Alleen de maker van het bord kan een link intrekken.' using errcode = 'PT403';
  end if;
  if p_which = 'edit' then
    update public.sb_boards set edit_token = public.sb_rand(12) where id = p_board returning * into v_b;
    delete from public.sb_board_members where board_id = p_board and role = 'edit';
  else
    update public.sb_boards set play_token = public.sb_rand(12) where id = p_board returning * into v_b;
    delete from public.sb_board_members where board_id = p_board and role = 'play';
  end if;
  return jsonb_build_object('playToken', v_b.play_token, 'editToken', v_b.edit_token);
end $$;

-- Weg ermee: de maker verwijdert het bord, een ander haalt het uit zijn lijst.
create or replace function public.sb_board_delete(p_ik text, p_board uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me uuid := public.sb_who(p_ik);
begin
  if v_me is null then raise exception 'Onbekende persoonlijke link.' using errcode = 'PT403'; end if;
  if exists (select 1 from public.sb_boards where id = p_board and owner = v_me) then
    delete from public.sb_boards where id = p_board;
    return jsonb_build_object('deleted', true);
  end if;
  delete from public.sb_board_members where board_id = p_board and person_id = v_me;
  return jsonb_build_object('left', true);
end $$;

-- ---------- geluiden ------------------------------------------------------

-- De bibliotheek: je eigen geluiden en wat anderen gedeeld hebben.
create or replace function public.sb_library(p_ik text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := public.sb_who(p_ik);
begin
  if v_me is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg((public.sb_def(s, v_me) - 'peaks') || jsonb_build_object('ownerName', p.name)
                     order by (s.owner = v_me) desc, s.created_at desc)
      from public.sb_sounds s join public.sb_people p on p.id = s.owner
     where s.deleted_at is null and (s.owner = v_me or s.shared)), '[]'::jsonb);
end $$;

-- Vraagt een plek aan in de opslag. Daarna mag de app precies dat ene
-- bestand uploaden, twintig minuten lang. Met een persoonlijke sleutel
-- wordt het jouw geluid; met alleen de BEWERK-link van een bord wordt het
-- een geluid van de maker van dat bord.
create or replace function public.sb_upload_ticket(p_ik text, p_token text, p_board uuid, p_kind text, p_bytes bigint)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me    uuid := public.sb_who(p_ik);
  v_eig   uuid;
  v_quota bigint;
  v_used  bigint;
  v_pad   text;
begin
  if v_me is not null then
    v_eig := v_me;
  elsif p_board is not null and p_token is not null then
    select owner into v_eig from public.sb_boards where id = p_board and edit_token = p_token;
  end if;
  if v_eig is null then
    raise exception 'Uploaden kan met een persoonlijke link of met de BEWERK-link van een bord.' using errcode = 'PT403';
  end if;
  if p_bytes is null or p_bytes <= 0 or p_bytes > 31457280 then
    raise exception 'Dit bestand is te groot (maximaal 30 MB).' using errcode = 'PT400';
  end if;
  select case when is_admin then null else quota_mb::bigint * 1048576 end into v_quota
    from public.sb_people where id = v_eig;
  select coalesce(sum(size_bytes), 0) into v_used
    from public.sb_sounds where owner = v_eig and deleted_at is null;
  if v_quota is not null and v_used + p_bytes > v_quota then
    raise exception 'De opslag is vol (% MB). Haal eerst een paar geluiden weg.', v_quota / 1048576 using errcode = 'PT400';
  end if;
  v_pad := case when p_kind = 'video' then 'v/' || public.sb_rand(15) || '.mp4'
                else 'a/' || public.sb_rand(15) || '.mp3' end;
  insert into public.sb_uploads (path, owner, board_id, kind, max_bytes, expires_at)
    values (v_pad, v_eig, p_board, case when p_kind = 'video' then 'video' else 'audio' end,
            p_bytes, now() + interval '20 minutes');
  return jsonb_build_object('path', v_pad);
end $$;

-- Mag dit bestand de opslag in? (voor de policy op storage.objects)
create or replace function public.sb_upload_allowed(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sb_uploads
                  where path = p_name and not done and expires_at > now());
$$;

-- Na het uploaden: het geluid in de bibliotheek zetten (en op het bord).
create or replace function public.sb_sound_add(p_ik text, p_token text, p_path text, p_meta jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me   uuid := public.sb_who(p_ik);
  v_u    public.sb_uploads;
  v_size bigint;
  v_s    public.sb_sounds;
  v_dur  real := least(greatest(coalesce((p_meta->>'duration')::real, 0), 0), 36000);
begin
  select * into v_u from public.sb_uploads where path = p_path for update;
  if not found or v_u.done then
    raise exception 'Deze upload is niet (meer) bekend.' using errcode = 'PT404';
  end if;
  if not ((v_me is not null and v_u.owner = v_me)
          or (p_token is not null and exists (select 1 from public.sb_boards
                                               where id = v_u.board_id and edit_token = p_token))) then
    raise exception 'Deze upload is niet van jou.' using errcode = 'PT403';
  end if;
  select (metadata->>'size')::bigint into v_size
    from storage.objects where bucket_id = 'soundboard' and name = p_path;
  if v_size is null then
    raise exception 'Het bestand is niet aangekomen.' using errcode = 'PT400';
  end if;
  insert into public.sb_sounds (id, owner, kind, path, label, icon, color, gain_db, duration,
                                peaks, stream, w, h, size_bytes, shared)
  values ('u' || public.sb_rand(9), v_u.owner, v_u.kind, p_path,
          upper(left(coalesce(nullif(trim(p_meta->>'label'), ''), 'NIEUW GELUID'), 40)),
          left(coalesce(nullif(p_meta->>'icon', ''), 'wave'), 30),
          case when (p_meta->>'color') ~ '^#[0-9a-fA-F]{6}$' then p_meta->>'color' end,
          least(greatest(coalesce((p_meta->>'gainDb')::real, 0), -30), 30),
          v_dur,
          (select array_agg(least(100, greatest(0, round(x::numeric)))::smallint)
             from (select x from jsonb_array_elements_text(coalesce(p_meta->'peaks', '[]'::jsonb)) x limit 600) q),
          v_u.kind = 'video' or v_dur > 60,
          nullif((p_meta->>'w')::integer, 0), nullif((p_meta->>'h')::integer, 0),
          v_size,
          v_me is not null and v_me = v_u.owner and coalesce((p_meta->>'shared')::boolean, false))
  returning * into v_s;
  update public.sb_uploads set done = true where path = p_path;
  if v_u.board_id is not null then
    insert into public.sb_board_sounds (board_id, sound_id) values (v_u.board_id, v_s.id)
      on conflict do nothing;
  end if;
  return public.sb_def(v_s, v_me);
end $$;

-- Naam, icoon, kleur of gedeeld/privé van een eigen geluid aanpassen.
create or replace function public.sb_sound_update(p_ik text, p_sound text, p_meta jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me uuid := public.sb_who(p_ik);
  v_s  public.sb_sounds;
begin
  select * into v_s from public.sb_sounds where id = p_sound and owner = v_me and deleted_at is null;
  if v_me is null or not found then
    raise exception 'Dit is niet jouw geluid.' using errcode = 'PT403';
  end if;
  update public.sb_sounds set
    label  = case when p_meta ? 'label' then upper(left(coalesce(nullif(trim(p_meta->>'label'), ''), label), 40)) else label end,
    icon   = case when p_meta ? 'icon' then left(coalesce(nullif(p_meta->>'icon', ''), icon), 30) else icon end,
    color  = case when p_meta ? 'color' and (p_meta->>'color') ~ '^#[0-9a-fA-F]{6}$' then p_meta->>'color' else color end,
    shared = case when p_meta ? 'shared' then coalesce((p_meta->>'shared')::boolean, shared) else shared end
  where id = p_sound
  returning * into v_s;
  return public.sb_def(v_s, v_me);
end $$;

-- Een eigen geluid weghalen. Staat het nog op een bord, dan blijft het daar
-- werken tot het ook daar weg is; anders mag het bestand meteen weg.
create or replace function public.sb_sound_delete(p_ik text, p_sound text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me uuid := public.sb_who(p_ik);
  v_s  public.sb_sounds;
  v_n  integer;
begin
  select * into v_s from public.sb_sounds where id = p_sound and owner = v_me and deleted_at is null;
  if v_me is null or not found then
    raise exception 'Dit is niet jouw geluid.' using errcode = 'PT403';
  end if;
  update public.sb_sounds set deleted_at = now(), shared = false where id = p_sound;
  select count(*) into v_n from public.sb_board_sounds where sound_id = p_sound;
  return jsonb_build_object('boards', v_n, 'path', case when v_n = 0 then v_s.path end);
end $$;

-- Mag dit bestand weg? Alleen als het geluid verwijderd is en op geen bord meer staat.
create or replace function public.sb_delete_allowed(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sb_sounds s
                  where s.path = p_name and s.deleted_at is not null
                    and not exists (select 1 from public.sb_board_sounds bs where bs.sound_id = s.id));
$$;

-- Om het project wakker te houden (zie .github/workflows/wakker.yml).
create or replace function public.sb_ping()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.sb_boards;
$$;

-- ---------- rechten ------------------------------------------------------

revoke all on function public.sb_rand(integer), public.sb_hash(text), public.sb_who(text),
  public.sb_access(uuid, text, text), public.sb_def(public.sb_sounds, uuid),
  public.sb_board_json(public.sb_boards, text, uuid)
  from public, anon, authenticated;

revoke all on function
  public.sb_join(text, text), public.sb_me(text), public.sb_rename_me(text, text),
  public.sb_invite_create(text, text, integer), public.sb_admin_overview(text),
  public.sb_boards_list(text), public.sb_board_create(text, text, jsonb, text[]),
  public.sb_board_get(text, text, uuid), public.sb_board_version(text, text, uuid),
  public.sb_board_patch(text, text, uuid, jsonb), public.sb_board_add_sound(text, text, uuid, text),
  public.sb_board_copy(text, text, uuid, text, jsonb), public.sb_board_rotate(text, uuid, text),
  public.sb_board_delete(text, uuid), public.sb_library(text),
  public.sb_upload_ticket(text, text, uuid, text, bigint), public.sb_upload_allowed(text),
  public.sb_sound_add(text, text, text, jsonb), public.sb_sound_update(text, text, jsonb),
  public.sb_sound_delete(text, text), public.sb_delete_allowed(text), public.sb_ping()
  from public;

grant execute on function
  public.sb_join(text, text), public.sb_me(text), public.sb_rename_me(text, text),
  public.sb_invite_create(text, text, integer), public.sb_admin_overview(text),
  public.sb_boards_list(text), public.sb_board_create(text, text, jsonb, text[]),
  public.sb_board_get(text, text, uuid), public.sb_board_version(text, text, uuid),
  public.sb_board_patch(text, text, uuid, jsonb), public.sb_board_add_sound(text, text, uuid, text),
  public.sb_board_copy(text, text, uuid, text, jsonb), public.sb_board_rotate(text, uuid, text),
  public.sb_board_delete(text, uuid), public.sb_library(text),
  public.sb_upload_ticket(text, text, uuid, text, bigint), public.sb_upload_allowed(text),
  public.sb_sound_add(text, text, text, jsonb), public.sb_sound_update(text, text, jsonb),
  public.sb_sound_delete(text, text), public.sb_delete_allowed(text), public.sb_ping()
  to anon, authenticated;

-- ---------- opslag -------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('soundboard', 'soundboard', true, 31457280, array['audio/mpeg', 'video/mp4'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists sb_upload on storage.objects;
create policy sb_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'soundboard' and public.sb_upload_allowed(name));

drop policy if exists sb_opruimen_zien on storage.objects;
create policy sb_opruimen_zien on storage.objects for select to anon, authenticated
  using (bucket_id = 'soundboard' and public.sb_delete_allowed(name));

drop policy if exists sb_opruimen on storage.objects;
create policy sb_opruimen on storage.objects for delete to anon, authenticated
  using (bucket_id = 'soundboard' and public.sb_delete_allowed(name));
