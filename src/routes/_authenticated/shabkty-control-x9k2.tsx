import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Trash2, Plus, Eye, Check, X, Image as ImageIcon } from "lucide-react";
import { formatIQD } from "@/lib/payment";

export const Route = createFileRoute("/_authenticated/shabkty-control-x9k2")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid) throw redirect({ to: "/login" });
    const { data: role } = await supabase
      .from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
    if (!role) throw redirect({ to: "/dashboard" });
  },
  head: () => ({ meta: [{ title: "لوحة الإدارة" }] }),
  component: Admin,
});

type Cat = { id: string; name: string; slug: string };
type Pkg = { id: string; name: string; description: string | null; price_iqd: number; duration_days: number; image_url: string | null; category_id: string | null; is_active: boolean; sort_order: number };
type Ad = { id: string; title: string; body: string | null; image_url: string | null; link_url: string | null; is_active: boolean };
type Order = { id: string; status: "pending"|"approved"|"rejected"|"expired"; full_name: string; verification_code: string; payment_screenshot_url: string; delivered_code: string|null; admin_note: string|null; created_at: string; expires_at: string|null; user_id: string; packages: { name: string; price_iqd: number } | null };

function Admin() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ orders: 0, pending: 0, packages: 0, users: 0 });

  useEffect(() => {
    (async () => {
      const [a, b, c, d] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("packages").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);
      setStats({ orders: a.count ?? 0, pending: b.count ?? 0, packages: c.count ?? 0, users: d.count ?? 0 });
    })();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gradient mb-1">لوحة الإدارة</h1>
        <p className="text-sm text-muted-foreground mb-6">{user?.email}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatCard label="إجمالي الطلبات" value={stats.orders} />
          <StatCard label="قيد المراجعة" value={stats.pending} highlight />
          <StatCard label="الباقات" value={stats.packages} />
          <StatCard label="المستخدمون" value={stats.users} />
        </div>

        <Tabs defaultValue="orders" className="w-full">
          <TabsList className="bg-card border border-border/60">
            <TabsTrigger value="orders">الطلبات</TabsTrigger>
            <TabsTrigger value="packages">الباقات</TabsTrigger>
            <TabsTrigger value="categories">الفئات</TabsTrigger>
            <TabsTrigger value="ads">الإعلانات</TabsTrigger>
            <TabsTrigger value="users">المستخدمون</TabsTrigger>
          </TabsList>
          <TabsContent value="orders"><OrdersTab /></TabsContent>
          <TabsContent value="packages"><PackagesTab /></TabsContent>
          <TabsContent value="categories"><CategoriesTab /></TabsContent>
          <TabsContent value="ads"><AdsTab /></TabsContent>
          <TabsContent value="users"><UsersTab /></TabsContent>
        </Tabs>
      </main>
      <Footer />
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl p-5 border ${highlight ? "border-primary/50 gradient-card shadow-glow" : "border-border/60 bg-card"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
    </div>
  );
}

/* ---------------- Orders Tab ---------------- */
function OrdersTab() {
  const [items, setItems] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all"|"pending"|"approved"|"rejected">("pending");

  async function load() {
    setLoading(true);
    let q = supabase.from("orders").select("*, packages(name,price_iqd)").order("created_at", { ascending: false });
    if (filter !== "all") q = q.eq("status", filter);
    const { data } = await q;
    setItems((data ?? []) as unknown as Order[]);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  async function approve(o: Order) {
    const code = prompt("أدخل كود الاشتراك / الكونفج لإرساله للمستخدم:");
    if (!code) return;
    const { error } = await supabase.from("orders").update({ status: "approved", delivered_code: code }).eq("id", o.id);
    if (error) toast.error(error.message); else { toast.success("تم تفعيل الطلب"); load(); }
  }
  async function reject(o: Order) {
    const note = prompt("سبب الرفض (اختياري):") ?? "";
    const { error } = await supabase.from("orders").update({ status: "rejected", admin_note: note }).eq("id", o.id);
    if (error) toast.error(error.message); else { toast.success("تم رفض الطلب"); load(); }
  }
  async function viewScreenshot(path: string) {
    const { data, error } = await supabase.storage.from("payment-screenshots").createSignedUrl(path, 60 * 5);
    if (error || !data) return toast.error("تعذر تحميل الصورة");
    window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="mt-4">
      <div className="flex gap-2 mb-4 flex-wrap">
        {(["pending","approved","rejected","all"] as const).map((s) => (
          <Button key={s} size="sm" variant={filter === s ? "default" : "outline"} onClick={() => setFilter(s)} className={filter===s?"gradient-primary":""}>
            {({pending:"قيد المراجعة",approved:"المقبولة",rejected:"المرفوضة",all:"الكل"})[s]}
          </Button>
        ))}
      </div>
      {loading ? <div className="h-40 rounded-xl bg-card animate-pulse" /> :
       items.length === 0 ? <div className="text-center py-12 text-muted-foreground">لا توجد طلبات.</div> :
        <div className="space-y-3">
          {items.map((o) => (
            <div key={o.id} className="gradient-card border border-border/60 rounded-2xl p-5">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <div className="font-bold">{o.packages?.name} — {o.full_name}</div>
                  <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("ar-IQ")}</div>
                  <div className="text-xs mt-2">كود التحقق: <span className="font-mono">{o.verification_code}</span></div>
                  {o.packages && <div className="text-xs text-primary">{formatIQD(o.packages.price_iqd)}</div>}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => viewScreenshot(o.payment_screenshot_url)}>
                    <Eye className="size-4 ml-1" /> صورة الدفع
                  </Button>
                  {o.status === "pending" && <>
                    <Button size="sm" className="gradient-primary" onClick={() => approve(o)}>
                      <Check className="size-4 ml-1" /> قبول
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => reject(o)}>
                      <X className="size-4 ml-1" /> رفض
                    </Button>
                  </>}
                </div>
              </div>
              {o.delivered_code && <div className="mt-2 text-xs">كود الاشتراك المرسَل: <span className="font-mono">{o.delivered_code}</span></div>}
              {o.expires_at && <div className="text-xs text-muted-foreground">ينتهي: {new Date(o.expires_at).toLocaleString("ar-IQ")}</div>}
            </div>
          ))}
        </div>
      }
    </div>
  );
}

/* ---------------- Packages Tab ---------------- */
function PackagesTab() {
  const [items, setItems] = useState<Pkg[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Pkg> & { _file?: File | null }>({
    name: "", description: "", price_iqd: 0, duration_days: 30, is_active: true, sort_order: 0, category_id: null,
  });

  async function load() {
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from("packages").select("*").order("sort_order"),
      supabase.from("categories").select("id,name,slug"),
    ]);
    setItems((p ?? []) as Pkg[]);
    setCats((c ?? []) as Cat[]);
  }
  useEffect(() => { load(); }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    let image_url = form.image_url ?? null;
    if (form._file) {
      const ext = form._file.name.split(".").pop() || "png";
      const path = `pkg-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("package-images").upload(path, form._file, { contentType: form._file.type });
      if (up.error) return toast.error(up.error.message);
      const { data } = supabase.storage.from("package-images").getPublicUrl(path);
      image_url = data.publicUrl;
    }
    const payload = {
      name: form.name!, description: form.description ?? null, price_iqd: Number(form.price_iqd) || 0,
      duration_days: Number(form.duration_days) || 30, image_url,
      category_id: form.category_id || null, is_active: form.is_active ?? true, sort_order: Number(form.sort_order) || 0,
    };
    let error;
    if (form.id) ({ error } = await supabase.from("packages").update(payload).eq("id", form.id));
    else ({ error } = await supabase.from("packages").insert(payload));
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    setShowForm(false);
    setForm({ name: "", price_iqd: 0, duration_days: 30, is_active: true, sort_order: 0, category_id: null });
    load();
  }
  async function remove(id: string) {
    if (!confirm("حذف هذه الباقة؟")) return;
    const { error } = await supabase.from("packages").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("تم الحذف"); load(); }
  }

  return (
    <div className="mt-4">
      <div className="flex justify-between mb-4">
        <h3 className="font-bold">الباقات ({items.length})</h3>
        <Button size="sm" className="gradient-primary" onClick={() => { setForm({ name: "", price_iqd: 0, duration_days: 30, is_active: true, sort_order: 0, category_id: null }); setShowForm(true); }}>
          <Plus className="size-4 ml-1" /> باقة جديدة
        </Button>
      </div>
      {showForm && (
        <form onSubmit={save} className="gradient-card border border-border/60 rounded-2xl p-5 mb-4 grid md:grid-cols-2 gap-3">
          <div><Label>الاسم</Label><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div><Label>السعر (د.ع)</Label><Input type="number" value={form.price_iqd ?? 0} onChange={(e) => setForm({ ...form, price_iqd: +e.target.value })} required /></div>
          <div><Label>المدة (أيام)</Label><Input type="number" value={form.duration_days ?? 30} onChange={(e) => setForm({ ...form, duration_days: +e.target.value })} required /></div>
          <div>
            <Label>الفئة</Label>
            <select className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm" value={form.category_id ?? ""} onChange={(e) => setForm({ ...form, category_id: e.target.value || null })}>
              <option value="">بدون</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="md:col-span-2"><Label>الوصف</Label><Textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="md:col-span-2">
            <Label>صورة الباقة</Label>
            <Input type="file" accept="image/*" onChange={(e) => setForm({ ...form, _file: e.target.files?.[0] ?? null })} />
            {form.image_url && <img src={form.image_url} alt="" className="mt-2 rounded-md max-h-32" />}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            نشطة
          </label>
          <div className="flex gap-2 md:col-span-2">
            <Button type="submit" className="gradient-primary">حفظ</Button>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
          </div>
        </form>
      )}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((p) => (
          <div key={p.id} className="gradient-card border border-border/60 rounded-xl p-4">
            <div className="flex gap-3">
              {p.image_url ? <img src={p.image_url} className="size-16 rounded-md object-cover" alt="" /> :
                <div className="size-16 rounded-md bg-secondary flex items-center justify-center"><ImageIcon className="size-6 text-muted-foreground" /></div>}
              <div className="flex-1">
                <div className="font-bold">{p.name} {!p.is_active && <span className="text-xs text-muted-foreground">(مخفية)</span>}</div>
                <div className="text-xs text-primary">{formatIQD(p.price_iqd)}</div>
                <div className="text-xs text-muted-foreground">{p.duration_days} يوم</div>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => { setForm({ ...p }); setShowForm(true); }}>تعديل</Button>
              <Button size="sm" variant="destructive" onClick={() => remove(p.id)}><Trash2 className="size-4" /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Categories Tab ---------------- */
function CategoriesTab() {
  const [items, setItems] = useState<Cat[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  async function load() {
    const { data } = await supabase.from("categories").select("*").order("name");
    setItems((data ?? []) as Cat[]);
  }
  useEffect(() => { load(); }, []);
  async function add(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("categories").insert({ name, slug: slug || name.replace(/\s+/g, "-").toLowerCase() });
    if (error) toast.error(error.message); else { toast.success("تمت الإضافة"); setName(""); setSlug(""); load(); }
  }
  async function remove(id: string) {
    if (!confirm("حذف الفئة؟")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) toast.error(error.message); else load();
  }
  return (
    <div className="mt-4">
      <form onSubmit={add} className="gradient-card border border-border/60 rounded-2xl p-4 flex gap-2 flex-wrap mb-4">
        <Input placeholder="اسم الفئة" value={name} onChange={(e) => setName(e.target.value)} required className="flex-1 min-w-40" />
        <Input placeholder="slug (اختياري)" value={slug} onChange={(e) => setSlug(e.target.value)} className="flex-1 min-w-40" />
        <Button type="submit" className="gradient-primary"><Plus className="size-4 ml-1" /> إضافة</Button>
      </form>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
        {items.map((c) => (
          <div key={c.id} className="bg-card border border-border/60 rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="font-bold">{c.name}</div>
              <div className="text-xs text-muted-foreground">{c.slug}</div>
            </div>
            <Button size="sm" variant="destructive" onClick={() => remove(c.id)}><Trash2 className="size-4" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Ads Tab ---------------- */
function AdsTab() {
  const [items, setItems] = useState<Ad[]>([]);
  const [form, setForm] = useState<Partial<Ad> & { _file?: File | null }>({ title: "", body: "", link_url: "", is_active: true });
  async function load() {
    const { data } = await supabase.from("popup_ads").select("*").order("created_at", { ascending: false });
    setItems((data ?? []) as Ad[]);
  }
  useEffect(() => { load(); }, []);
  async function save(e: FormEvent) {
    e.preventDefault();
    let image_url = form.image_url ?? null;
    if (form._file) {
      const ext = form._file.name.split(".").pop() || "png";
      const path = `ad-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("ad-images").upload(path, form._file, { contentType: form._file.type });
      if (up.error) return toast.error(up.error.message);
      image_url = supabase.storage.from("ad-images").getPublicUrl(path).data.publicUrl;
    }
    const { error } = await supabase.from("popup_ads").insert({
      title: form.title!, body: form.body ?? null, image_url, link_url: form.link_url ?? null, is_active: form.is_active ?? true,
    });
    if (error) return toast.error(error.message);
    toast.success("تمت الإضافة"); setForm({ title: "", body: "", link_url: "", is_active: true }); load();
  }
  async function toggle(a: Ad) {
    await supabase.from("popup_ads").update({ is_active: !a.is_active }).eq("id", a.id);
    load();
  }
  async function remove(id: string) {
    if (!confirm("حذف الإعلان؟")) return;
    await supabase.from("popup_ads").delete().eq("id", id);
    load();
  }
  return (
    <div className="mt-4">
      <form onSubmit={save} className="gradient-card border border-border/60 rounded-2xl p-4 grid md:grid-cols-2 gap-3 mb-4">
        <div><Label>العنوان</Label><Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
        <div><Label>الرابط (اختياري)</Label><Input value={form.link_url ?? ""} onChange={(e) => setForm({ ...form, link_url: e.target.value })} /></div>
        <div className="md:col-span-2"><Label>النص</Label><Textarea value={form.body ?? ""} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
        <div className="md:col-span-2"><Label>صورة</Label><Input type="file" accept="image/*" onChange={(e) => setForm({ ...form, _file: e.target.files?.[0] ?? null })} /></div>
        <Button type="submit" className="gradient-primary md:col-span-2">إضافة الإعلان</Button>
      </form>
      <div className="space-y-2">
        {items.map((a) => (
          <div key={a.id} className="bg-card border border-border/60 rounded-xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {a.image_url && <img src={a.image_url} alt="" className="size-12 rounded object-cover" />}
              <div>
                <div className="font-bold">{a.title}</div>
                <div className="text-xs text-muted-foreground">{a.is_active ? "نشط" : "موقوف"}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => toggle(a)}>{a.is_active ? "إيقاف" : "تفعيل"}</Button>
              <Button size="sm" variant="destructive" onClick={() => remove(a.id)}><Trash2 className="size-4" /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Users Tab ---------------- */
function UsersTab() {
  const [users, setUsers] = useState<{ id: string; full_name: string | null; created_at: string; isAdmin: boolean }[]>([]);
  async function load() {
    const { data: profs } = await supabase.from("profiles").select("id,full_name,created_at").order("created_at", { ascending: false });
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    const adminSet = new Set((roles ?? []).map((r) => r.user_id));
    setUsers((profs ?? []).map((p) => ({ ...p, isAdmin: adminSet.has(p.id) })));
  }
  useEffect(() => { load(); }, []);
  async function toggleAdmin(uid: string, isAdmin: boolean) {
    if (isAdmin) {
      await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", "admin");
    } else {
      await supabase.from("user_roles").insert({ user_id: uid, role: "admin" });
    }
    load();
  }
  return (
    <div className="mt-4 space-y-2">
      {users.map((u) => (
        <div key={u.id} className="bg-card border border-border/60 rounded-xl p-4 flex items-center justify-between gap-3">
          <div>
            <div className="font-bold">{u.full_name || "—"}</div>
            <div className="text-xs text-muted-foreground font-mono">{u.id}</div>
          </div>
          <Button size="sm" variant={u.isAdmin ? "destructive" : "outline"} onClick={() => toggleAdmin(u.id, u.isAdmin)}>
            {u.isAdmin ? "إزالة المسؤول" : "تعيين مسؤول"}
          </Button>
        </div>
      ))}
    </div>
  );
}
