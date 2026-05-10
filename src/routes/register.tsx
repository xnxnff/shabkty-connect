import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Header } from "@/components/Header";
import { toast } from "sonner";
import { z } from "zod";

const schema = z.object({
  full_name: z.string().trim().min(2, "الاسم قصير").max(80),
  email: z.string().trim().email("بريد غير صالح").max(255),
  password: z.string().min(6, "كلمة السر 6 أحرف على الأقل").max(72),
});

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [{ title: "إنشاء حساب — شبكتي ستور" }] }),
  component: RegisterPage,
});

function RegisterPage() {
  const nav = useNavigate();
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { full_name: form.full_name },
        emailRedirectTo: window.location.origin,
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم إنشاء حسابك بنجاح");
    nav({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <form onSubmit={onSubmit} className="w-full max-w-md gradient-card border border-border/60 rounded-2xl p-8 shadow-elegant animate-fade-up">
          <h1 className="text-2xl font-bold mb-1 text-gradient">إنشاء حساب</h1>
          <p className="text-sm text-muted-foreground mb-6">انضم إلى شبكتي ستور بخطوات بسيطة</p>
          <div className="space-y-4">
            <div>
              <Label htmlFor="full_name">الاسم الكامل</Label>
              <Input id="full_name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input id="email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="password">كلمة السر</Label>
              <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
          </div>
          <Button disabled={loading} className="w-full mt-6 gradient-primary">
            {loading ? "جارٍ الإنشاء..." : "إنشاء الحساب"}
          </Button>
          <p className="mt-4 text-sm text-center text-muted-foreground">
            لديك حساب؟ <Link to="/login" className="text-primary hover:underline">سجّل دخول</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
