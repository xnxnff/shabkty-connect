import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Bell, Package as PackageIcon, ShoppingBag } from "lucide-react";
import { formatIQD } from "@/lib/payment";

type Order = {
  id: string;
  status: "pending" | "approved" | "rejected" | "expired";
  full_name: string;
  verification_code: string;
  delivered_code: string | null;
  expires_at: string | null;
  created_at: string;
  admin_note: string | null;
  packages: { name: string; price_iqd: number; duration_days: number } | null;
};

const statusLabel: Record<Order["status"], { text: string; cls: string }> = {
  pending: { text: "قيد المراجعة", cls: "bg-warning/20 text-warning border-warning/40" },
  approved: { text: "مفعّل", cls: "bg-success/20 text-success border-success/40" },
  rejected: { text: "مرفوض", cls: "bg-destructive/20 text-destructive border-destructive/40" },
  expired: { text: "منتهي", cls: "bg-muted text-muted-foreground border-border" },
};

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "لوحتي — شبكتي ستور" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: o }, { count }] = await Promise.all([
        supabase
          .from("orders")
          .select("id,status,full_name,verification_code,delivered_code,expires_at,created_at,admin_note,packages(name,price_iqd,duration_days)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("is_read", false),
      ]);
      setOrders((o ?? []) as unknown as Order[]);
      setUnread(count ?? 0);
      setLoading(false);
    })();
  }, [user]);

  const active = orders.filter((o) => o.status === "approved" && o.expires_at && new Date(o.expires_at) > new Date());

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gradient">لوحتي</h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/notifications">
                <Bell className="size-4 ml-1" /> الإشعارات {unread > 0 && <span className="mr-1 size-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">{unread}</span>}
              </Link>
            </Button>
            <Button asChild className="gradient-primary">
              <Link to="/packages"><ShoppingBag className="size-4 ml-1" /> الباقات</Link>
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Stat label="إجمالي الطلبات" value={orders.length} />
          <Stat label="الاشتراكات الفعّالة" value={active.length} />
          <Stat label="إشعارات غير مقروءة" value={unread} />
        </div>

        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <PackageIcon className="size-5 text-primary" /> طلباتي
        </h2>
        {loading ? (
          <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="h-24 rounded-xl bg-card animate-pulse border border-border/60" />)}</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16 gradient-card border border-border/60 rounded-2xl">
            <p className="text-muted-foreground mb-4">لا يوجد طلبات بعد.</p>
            <Button asChild className="gradient-primary"><Link to="/packages">تصفح الباقات</Link></Button>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => {
              const st = statusLabel[o.status];
              return (
                <div key={o.id} className="gradient-card border border-border/60 rounded-2xl p-5">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                      <div className="font-bold">{o.packages?.name ?? "باقة"}</div>
                      <div className="text-xs text-muted-foreground">
                        {o.packages && formatIQD(o.packages.price_iqd)} • {new Date(o.created_at).toLocaleDateString("ar-IQ")}
                      </div>
                    </div>
                    <span className={`text-xs px-3 py-1 rounded-full border ${st.cls}`}>{st.text}</span>
                  </div>
                  <div className="mt-3 grid sm:grid-cols-2 gap-3 text-sm">
                    <Field label="كود التحقق">{o.verification_code}</Field>
                    {o.delivered_code && <Field label="كود الاشتراك"><span className="font-mono">{o.delivered_code}</span></Field>}
                    {o.expires_at && <Field label="ينتهي في">{new Date(o.expires_at).toLocaleString("ar-IQ")}</Field>}
                    {o.admin_note && o.status === "rejected" && <Field label="ملاحظة الإدارة">{o.admin_note}</Field>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="gradient-card border border-border/60 rounded-2xl p-5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-3xl font-bold text-gradient mt-1">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-secondary/40 rounded-lg p-3">
      <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
