
-- Bot settings (key/value)
CREATE TABLE IF NOT EXISTS public.bot_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bot_settings_admin_all" ON public.bot_settings FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.bot_settings(key, value) VALUES
  ('support_username', 'xnxnff'),
  ('points_per_referral', '10'),
  ('how_to_use', E'📘 <b>كيفية استخدام الكود</b>\n\n1️⃣ انسخ كود الاشتراك الذي وصلك.\n2️⃣ افتح تطبيق الـ VPN الخاص بك.\n3️⃣ الصق الكود في خانة التفعيل.\n4️⃣ استمتع بالخدمة طوال مدة الاشتراك.\n\nلأي مشكلة تواصل مع الدعم.')
ON CONFLICT (key) DO NOTHING;

-- User points & referrals
CREATE TABLE IF NOT EXISTS public.user_points (
  telegram_user_id bigint PRIMARY KEY,
  points integer NOT NULL DEFAULT 0,
  referral_code text NOT NULL UNIQUE,
  referred_by bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_points_admin_all" ON public.user_points FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Attach order status trigger so approve/reject side-effects run
DROP TRIGGER IF EXISTS trg_on_order_status_change ON public.orders;
CREATE TRIGGER trg_on_order_status_change
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.on_order_status_change();
