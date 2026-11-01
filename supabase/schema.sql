-- El Rey de las Redes · esquema de base de datos
-- Pega todo este archivo en Supabase > SQL Editor > New query y pulsa "Run".
-- Se puede ejecutar más de una vez sin romper nada.

create extension if not exists pgcrypto;

-- Creadores del ranking
create table if not exists creators (
  id uuid primary key default gen_random_uuid(),
  handle text not null,
  platform text not null check (platform in ('tiktok', 'instagram')),
  name text not null,
  cat text not null,
  url text not null,
  photo_url text,
  verified boolean not null default false,
  verify_code text,
  verify_requested_at timestamptz,
  goal_text text,
  goal_target integer,
  alert_email text,
  owner_token text not null,
  hidden boolean not null default false,
  clicks integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists creators_platform_handle on creators (platform, lower(handle));

-- Cada pago confirmado por Stripe (pujas de creadores y apoyos de fans)
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  stripe_ref text not null unique,          -- id de la sesión (pago único) o de la factura (mensual)
  creator_id uuid not null references creators (id) on delete cascade,
  kind text not null check (kind in ('bid', 'fan')),
  amount_cents integer not null check (amount_cents > 0),
  nick text,
  fan_token text,
  monthly boolean not null default false,
  season text not null,                     -- p. ej. 2026-W45
  created_at timestamptz not null default now()
);
create index if not exists payments_season on payments (season);
create index if not exists payments_creator on payments (creator_id, created_at);

-- Apoyos mensuales (suscripciones de Stripe)
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  stripe_subscription_id text not null unique,
  creator_id uuid not null references creators (id) on delete cascade,
  fan_token text not null,
  nick text,
  amount_cents integer not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);
create index if not exists subscriptions_fan on subscriptions (fan_token);

-- Duelos entre creadores
create table if not exists duels (
  id uuid primary key default gen_random_uuid(),
  a uuid not null references creators (id) on delete cascade,  -- quien reta
  b uuid not null references creators (id) on delete cascade,  -- retado
  status text not null default 'pending' check (status in ('pending', 'active', 'done', 'declined')),
  starts_at timestamptz,
  ends_at timestamptz,
  winner uuid references creators (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Cambios de rey (para el récord de reinado más largo)
create table if not exists king_log (
  id bigserial primary key,
  season text not null,
  creator_id uuid not null references creators (id) on delete cascade,
  since timestamptz not null default now()
);
create index if not exists king_log_season on king_log (season, since);

-- Salón de reyes: el número 1 de cada temporada cerrada
create table if not exists hall (
  season text primary key,
  creator_id uuid references creators (id) on delete set null,
  name text not null,
  handle text not null,
  total_cents integer not null,
  fans integer not null default 0,
  created_at timestamptz not null default now()
);

-- Lista de espera
create table if not exists waitlist (
  email text primary key,
  created_at timestamptz not null default now()
);

-- Sumar clics sin condiciones de carrera
create or replace function add_click(cid uuid) returns void language sql as $$
  update creators set clicks = clicks + 1 where id = cid and hidden = false;
$$;

-- Seguridad: nadie desde fuera puede leer ni escribir directamente.
-- Solo el servidor (con la clave service_role) accede a los datos.
alter table creators enable row level security;
alter table payments enable row level security;
alter table subscriptions enable row level security;
alter table duels enable row level security;
alter table king_log enable row level security;
alter table hall enable row level security;
alter table waitlist enable row level security;

-- Carpeta pública para las fotos de perfil
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

-- ===== Contador de visitas (añadido después; se puede ejecutar solo este bloque) =====
create table if not exists visits_daily (
  day date not null,
  source text not null,
  views integer not null default 0,
  uniques integer not null default 0,
  primary key (day, source)
);
alter table visits_daily enable row level security;

create or replace function add_visit(d date, s text, u boolean) returns void language sql as $$
  insert into visits_daily (day, source, views, uniques) values (d, s, 1, case when u then 1 else 0 end)
  on conflict (day, source) do update
    set views = visits_daily.views + 1,
        uniques = visits_daily.uniques + (case when u then 1 else 0 end);
$$;

-- ===== Clics únicos por temporada (añadido después; se puede ejecutar solo este bloque) =====
-- Cada persona cuenta como máximo 1 clic por creador y temporada. Sirve para desempatar el ranking.
create table if not exists creator_clicks (
  creator_id uuid not null references creators (id) on delete cascade,
  visitor text not null,
  season text not null,
  created_at timestamptz not null default now(),
  primary key (creator_id, visitor, season)
);
create table if not exists season_clicks (
  creator_id uuid not null references creators (id) on delete cascade,
  season text not null,
  n integer not null default 0,
  primary key (creator_id, season)
);
alter table creator_clicks enable row level security;
alter table season_clicks enable row level security;

create or replace function add_unique_click(cid uuid, v text, s text) returns void language plpgsql as $$
begin
  insert into creator_clicks (creator_id, visitor, season) values (cid, v, s) on conflict do nothing;
  if found then
    update creators set clicks = clicks + 1 where id = cid and hidden = false;
    insert into season_clicks (creator_id, season, n) values (cid, s, 1)
      on conflict (creator_id, season) do update set n = season_clicks.n + 1;
  end if;
end $$;

-- ===== Invitaciones gratis (añadido después; se puede ejecutar solo este bloque) =====
alter table creators add column if not exists invited_at timestamptz;
alter table creators add column if not exists invited_season text;
alter table creators add column if not exists invite_code text;

create table if not exists invites (
  code text primary key,
  note text,
  max_uses integer not null default 5,
  uses integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table invites enable row level security;

-- Gasta un uso de la invitación solo si quedan usos y no ha caducado
create or replace function use_invite(c text) returns boolean language plpgsql as $$
begin
  update invites set uses = uses + 1
   where code = c and uses < max_uses and (expires_at is null or expires_at > now());
  return found;
end $$;
