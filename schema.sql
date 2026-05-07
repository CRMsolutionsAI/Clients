-- Запустите этот SQL в Supabase → SQL Editor → New query

create table if not exists client_data (
  client_id    text primary key,
  client_name  text    default 'Клиент',
  rows         jsonb   default '[]',
  payments     jsonb   default '[]',
  knowledge    jsonb   default '[]',
  tasks        jsonb   default '[]',
  updated_at   timestamptz default now()
);

-- Отключаем RLS (личный инструмент, публичный anon-ключ)
alter table client_data disable row level security;
