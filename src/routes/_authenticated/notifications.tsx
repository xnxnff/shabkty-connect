import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type Notif = {
  id: string; title: string; body: string | null; type: string; is_read: boolean; created_at: string;
};

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "الإشعارات — شبكتي ستور" }] }),
  component: NotifsPage,
});

function NotifsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setItems((data ?? []) as Notif[]);
    })();
  }, [user]);

  async function markAll() {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  const color = (t: string) =>
    t === "success" ? "border-success/40 bg-success/10" :
    t === "error" ? "border-destructive/40 bg-destructive/10" :
    "border-border bg-card";

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-10 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gradient flex items-center gap-2"><Bell className="size-6" /> الإشعارات</h1>
          <Button variant="outline" onClick={markAll}><CheckCheck className="size-4 ml-1" /> تعليم الكل كمقروء</Button>
        </div>
        {items.length === 0 ? (
          <div className="text-center py-16 gradient-card rounded-2xl border border-border/60 text-muted-foreground">لا يوجد إشعارات.</div>
        ) : (
          <div className="space-y-3">
            {items.map((n) => (
              <div key={n.id} className={`rounded-xl p-4 border ${color(n.type)} ${!n.is_read ? "shadow-glow" : ""}`}>
                <div className="font-bold">{n.title}</div>
                {n.body && <p className="text-sm text-muted-foreground mt-1">{n.body}</p>}
                <div className="text-[10px] text-muted-foreground mt-2">{new Date(n.created_at).toLocaleString("ar-IQ")}</div>
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
