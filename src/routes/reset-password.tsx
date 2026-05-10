import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "إعادة تعيين كلمة السر — شبكتي ستور" }] }),
  component: ResetPage,
});

function ResetPage() {
  const [mode, setMode] = useState<"request" | "update">("request");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      setMode("update");
    }
  }, []);

  async function request(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("تم إرسال رابط الاستعادة إلى بريدك");
  }

  async function update(e: FormEvent) {
    e.preventDefault();
    if (pwd.length < 6) return toast.error("كلمة السر 6 أحرف على الأقل");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("تم تحديث كلمة السر");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <form
          onSubmit={mode === "request" ? request : update}
          className="w-full max-w-md gradient-card border border-border/60 rounded-2xl p-8 shadow-elegant"
        >
          <h1 className="text-2xl font-bold mb-1 text-gradient">
            {mode === "request" ? "استعادة كلمة السر" : "كلمة سر جديدة"}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {mode === "request" ? "أدخل بريدك لاستلام رابط الاستعادة" : "أدخل كلمة السر الجديدة"}
          </p>
          {mode === "request" ? (
            <div>
              <Label htmlFor="email">البريد</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
          ) : (
            <div>
              <Label htmlFor="pwd">كلمة السر الجديدة</Label>
              <Input id="pwd" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} required />
            </div>
          )}
          <Button disabled={loading} className="w-full mt-6 gradient-primary">
            {loading ? "..." : mode === "request" ? "إرسال" : "تحديث"}
          </Button>
        </form>
      </main>
    </div>
  );
}
