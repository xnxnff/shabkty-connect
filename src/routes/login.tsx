import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Header } from "@/components/Header";
import { toast } from "sonner";
import { z } from "zod";

const schema = z.object({
  email: z.string().trim().email("بريد إلكتروني غير صالح").max(255),
  password: z.string().min(6, "كلمة السر 6 أحرف على الأقل").max(72),
});

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : "/dashboard",
  }),
  head: () => ({ meta: [{ title: "تسجيل الدخول — شبكتي ستور" }] }),
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const search = useSearch({ from: "/login" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message === "Invalid login credentials" ? "بيانات الدخول غير صحيحة" : error.message);
      return;
    }
    toast.success("تم تسجيل الدخول");
    nav({ to: search.redirect || "/dashboard" });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <form onSubmit={onSubmit} className="w-full max-w-md gradient-card border border-border/60 rounded-2xl p-8 shadow-elegant animate-fade-up">
          <h1 className="text-2xl font-bold mb-1 text-gradient">تسجيل الدخول</h1>
          <p className="text-sm text-muted-foreground mb-6">أهلاً بعودتك إلى شبكتي ستور</p>
          <div className="space-y-4">
            <div>
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password">كلمة السر</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full mt-6 gradient-primary">
            {loading ? "جارٍ الدخول..." : "دخول"}
          </Button>
          <div className="mt-4 flex items-center justify-between text-sm">
            <Link to="/reset-password" className="text-muted-foreground hover:text-primary">نسيت كلمة السر؟</Link>
            <Link to="/register" className="text-primary hover:underline">إنشاء حساب جديد</Link>
          </div>
        </form>
      </main>
    </div>
  );
}
