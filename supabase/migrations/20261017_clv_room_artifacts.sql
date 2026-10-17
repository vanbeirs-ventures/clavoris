-- Interactive artifacts in data rooms (e.g. a live business-plan model built in claude.ai).
-- An artifact belongs to one company and keeps immutable published versions (HTML + a JSON data snapshot).
-- It is shown in a room only through a clv_room_artifacts link, which is created DISABLED: nothing is visible
-- to members until company staff switch the link on in Admin › Data rooms › Interactive.
-- The HTML and data live only in this database (never in the public repository); members receive them through
-- the clv-room-artifacts edge function after the same checks as the room's documents (active, unexpired
-- assignment, NDA signed when required, second factor). All access goes through edge functions (service role);
-- RLS is on with no client policies.

create table if not exists public.clv_artifacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.clv_companies(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  title text not null check (char_length(title) between 1 and 160),
  description text check (char_length(description) <= 1000),
  source_url text,                         -- where the artifact is edited (e.g. claude.ai link); staff only
  current_version integer,                 -- latest published version
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clv_artifact_versions (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references public.clv_artifacts(id) on delete cascade,
  version integer not null check (version > 0),
  html text not null check (octet_length(html) <= 8 * 1024 * 1024),
  data jsonb not null default '{}'::jsonb,  -- read-only snapshot served to the page as window.claude db collections
  sha256 text not null,                    -- of html + canonical data, recorded with every view
  note text check (char_length(note) <= 500),
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  unique (artifact_id, version)
);

create table if not exists public.clv_room_artifacts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.clv_rooms(id) on delete cascade,
  artifact_id uuid not null references public.clv_artifacts(id) on delete cascade,
  label text check (char_length(label) <= 160),      -- title shown in the room (default: artifact title)
  pinned_version integer,                            -- null = always the latest published version
  -- Viewer configuration, applied by the host page:
  --   hide: CSS selectors hidden in the artifact (tabs, buttons, sections)
  --   collections: data collections exposed (default all of the snapshot)
  --   print: allow printing (default false)   watermark: overlay viewer identity (default true)
  config jsonb not null default '{"hide": [], "print": false, "watermark": true}'::jsonb,
  enabled boolean not null default false,
  position integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  enabled_at timestamptz,
  enabled_by uuid references auth.users(id) on delete set null,
  unique (room_id, artifact_id)
);
create index if not exists clv_room_artifacts_room_idx on public.clv_room_artifacts (room_id, position);

alter table public.clv_artifacts enable row level security;
alter table public.clv_artifact_versions enable row level security;
alter table public.clv_room_artifacts enable row level security;

grant select, insert, update, delete on table public.clv_artifacts, public.clv_artifact_versions, public.clv_room_artifacts to service_role;
revoke all on table public.clv_artifacts, public.clv_artifact_versions, public.clv_room_artifacts from anon, authenticated;

-- Views of an artifact are logged like document views.
alter table public.clv_access_log drop constraint if exists clv_access_log_action_check;
alter table public.clv_access_log add constraint clv_access_log_action_check
  check (action in ('login','kyc-start','list','view','download','room-view','nda-signed','download-nda','presence','artifact-view'));
