-- Data-room Q&A. Questions are private between the asker and the room's answerers; an answerer can share a
-- question with its answers with all members of the room. All access goes through the clv-room-qa edge
-- function (service role); RLS is on with no client policies.
alter table public.clv_room_assignments add column if not exists answers_questions boolean not null default false;

create table if not exists public.clv_room_questions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.clv_rooms(id) on delete cascade,
  asker_id uuid not null references auth.users(id) on delete cascade,
  directed_to uuid references auth.users(id) on delete set null,
  file_name text,
  body text not null check (char_length(body) between 1 and 4000),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clv_room_questions_room_idx on public.clv_room_questions (room_id, created_at desc);

create table if not exists public.clv_room_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.clv_room_questions(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 8000),
  created_at timestamptz not null default now()
);
create index if not exists clv_room_answers_q_idx on public.clv_room_answers (question_id, created_at);

alter table public.clv_room_questions enable row level security;
alter table public.clv_room_answers enable row level security;
