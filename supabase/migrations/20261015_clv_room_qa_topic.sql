-- Q&A topic: "nda" marks a comment or question on the room's non-disclosure agreement. Such questions can be
-- asked before the NDA is signed; members who have not signed yet only see NDA-topic questions.
alter table public.clv_room_questions add column if not exists topic text check (topic is null or topic in ('nda'));
