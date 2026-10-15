-- Data-room identity is private by default: other members see only the member ID until the member chooses
-- to show their name. Members who never made an explicit choice become private.
alter table public.clv_profiles alter column member_private set default true;
update public.clv_profiles set member_private = true where privacy_chosen_at is null and member_private = false;
