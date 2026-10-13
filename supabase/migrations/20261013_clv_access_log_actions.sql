-- Allow the data-room event types written by clv-room / clv-room-nda / clv-room-file.
alter table clv_access_log drop constraint if exists clv_access_log_action_check;
alter table clv_access_log add constraint clv_access_log_action_check
  check (action in ('list','view','download','room-view','nda-signed','download-nda','presence'));

-- room-view / presence entries carry no file path.
alter table clv_access_log alter column file_path drop not null;
