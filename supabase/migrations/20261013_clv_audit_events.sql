-- Audit trail: login and KYC-start events join the data-room events.
alter table clv_access_log drop constraint if exists clv_access_log_action_check;
alter table clv_access_log add constraint clv_access_log_action_check
  check (action in ('login','kyc-start','list','view','download','room-view','nda-signed','download-nda','presence'));
create index if not exists clv_access_log_user_ts on clv_access_log (user_id, ts desc);
