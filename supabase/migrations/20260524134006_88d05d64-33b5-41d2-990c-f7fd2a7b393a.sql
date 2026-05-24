
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS price_points integer;

CREATE OR REPLACE FUNCTION public.on_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pkg_duration int;
begin
  if NEW.status = 'approved' and OLD.status is distinct from 'approved' then
    select duration_days into pkg_duration from public.packages where id = NEW.package_id;
    NEW.delivered_at := now();
    NEW.expires_at := now() + make_interval(days => pkg_duration);
    if NEW.user_id is not null then
      insert into public.notifications(user_id, title, body, type)
        values (NEW.user_id, 'تم تفعيل اشتراكك', 'تم قبول طلبك وإرسال كود الاشتراك إليك.', 'success');
    end if;
  elsif NEW.status = 'rejected' and OLD.status is distinct from 'rejected' then
    if NEW.user_id is not null then
      insert into public.notifications(user_id, title, body, type)
        values (NEW.user_id, 'تم رفض الطلب', coalesce(NEW.admin_note, 'يرجى مراجعة بيانات الدفع.'), 'error');
    end if;
  end if;
  return NEW;
end; $function$;

DROP TRIGGER IF EXISTS trg_orders_status ON public.orders;
