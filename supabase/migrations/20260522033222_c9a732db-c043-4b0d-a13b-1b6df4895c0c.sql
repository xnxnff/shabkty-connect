
-- Sessions for Telegram bot flow (server-managed only)
CREATE TABLE IF NOT EXISTS public.telegram_sessions (
  telegram_user_id BIGINT PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_sessions ENABLE ROW LEVEL SECURITY;
-- No policies: only service role (webhook) accesses this table.

-- Track which Telegram user created an order
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT,
  ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_orders_telegram_user_id ON public.orders(telegram_user_id);

-- Allow orders without a Supabase auth user (bot-only customers)
ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;

-- Permissive policy so admin trigger / service role keeps working; user policies stay intact
