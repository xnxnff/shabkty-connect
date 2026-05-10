import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ShoppingCart } from "lucide-react";
import { formatIQD } from "@/lib/payment";

type Pkg = {
  id: string;
  name: string;
  description: string | null;
  price_iqd: number;
  duration_days: number;
  image_url: string | null;
  category_id: string | null;
};
type Cat = { id: string; name: string };

export const Route = createFileRoute("/packages")({
  head: () => ({ meta: [{ title: "الباقات — شبكتي ستور" }] }),
  component: PackagesPage,
});

function PackagesPage() {
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: c }] = await Promise.all([
        supabase.from("packages").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("categories").select("id,name"),
      ]);
      setPkgs((p ?? []) as Pkg[]);
      setCats((c ?? []) as Cat[]);
      setLoading(false);
    })();
  }, []);

  const filtered = pkgs.filter((p) => {
    if (cat && p.category_id !== cat) return false;
    if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gradient mb-2">باقات الاشتراكات</h1>
          <p className="text-muted-foreground">اختر الباقة المناسبة لك وابدأ خلال دقائق.</p>
        </div>

        <div className="flex flex-col md:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن باقة..." className="pr-10" />
          </div>
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="rounded-md border border-input bg-input px-3 py-2 text-sm"
          >
            <option value="">كل الفئات</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1,2,3,4,5,6].map((i) => (
              <div key={i} className="h-72 rounded-2xl bg-card animate-pulse border border-border/60" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 gradient-card rounded-2xl border border-border/60">
            <p className="text-muted-foreground">لا توجد باقات متاحة حالياً.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((p) => (
              <div key={p.id} className="gradient-card rounded-2xl border border-border/60 overflow-hidden shadow-elegant hover:-translate-y-1 hover:shadow-glow transition">
                <div className="aspect-video bg-secondary overflow-hidden">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full gradient-primary flex items-center justify-center text-primary-foreground text-3xl font-bold">
                      {p.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="font-bold text-lg mb-1">{p.name}</h3>
                  {p.description && <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{p.description}</p>}
                  <div className="flex items-baseline justify-between mb-4">
                    <div className="text-xl font-bold text-primary">{formatIQD(p.price_iqd)}</div>
                    <div className="text-xs text-muted-foreground">{p.duration_days} يوم</div>
                  </div>
                  <Button asChild className="w-full gradient-primary">
                    <Link to="/checkout/$packageId" params={{ packageId: p.id }}>
                      <ShoppingCart className="size-4 ml-1" /> اشترك الآن
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
