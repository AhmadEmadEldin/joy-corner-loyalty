alter table accounts add column if not exists marketing_consent boolean not null default false;
alter table accounts add column if not exists marketing_consent_at timestamptz;

create index if not exists idx_accounts_marketing_consent
  on accounts(role, marketing_consent)
  where role = 'customer';
