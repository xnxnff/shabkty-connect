import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Copy, CreditCard, Upload, Check } from "lucide-react";
import { MASTERCARD_NUMBER, generateVerificationCode, formatIQD } from "@/lib/payment";
import { z } from "zod";

type Pkg = {
  id: string; name: string; price_iqd: number; duration_days: number; description: string | null; image_url: string | null;
};

const schema = z.object({
  full_name: z.string().trim().min(3, "اسم قصير").max(80),
});

export const Route = createFileRoute("/_authenticated/checkout/$packageId")({
  head: () => ({ meta: [{ title: "تأكيد الطلب — شبكتي ستور" }] }),
  component: Checkout,
});

function Checkout() {
  const { packageId } = Route.useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [pkg, setPkg] = useState<Pkg | null>(null);
  const [fullName, setFullName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [submittedAt, setSubmittedAt] = useState(0);
  const code = useMemo(() => generateVerificationCode(), []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("packages").select("*").eq("id", packageId).maybeSingle();
      setPkg(data as Pkg | null);
    })();
  }, [packageId]);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`تم نسخ ${label}`);
    } catch { toast.error("تعذر النسخ"); }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user || !pkg) return;
    if (Date.now() - submittedAt < 5000) {
      toast.error("الرجاء الانتظار قبل المحاولة مجدداً");
      return;
    }
    const parsed = schema.safeParse({ full_name: fullName });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (!file) return toast.error("الرجاء رفع صورة إثبات الدفع");
    if (file.size > 5 * 1024 * 1024) return toast.error("حجم الصورة أكبر من 5MB");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return toast.error("الصيغة غير مدعومة (PNG/JPG/WEBP)");

    setLoading(true);
    setSubmittedAt(Date.now());
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const up = await supabase.storage.from("payment-screenshots").upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      const { error } = await supabase.from("orders").insert({
        user_id: user.id,
        package_id: pkg.id,
        full_name: fullName,
        payment_screenshot_url: path,
        verification_code: code,
      });
      if (error) throw error;
      toast.success("تم إرسال طلبك بنجاح");
      nav({ to: "/dashboard" });
    } catch (err) {
      toast.error((err as Error).message || "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }

  if (!pkg) return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="h-64 rounded-2xl bg-card animate-pulse" />
      </main>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-10 max-w-3xl">
        <h1 className="text-3xl font-bold text-gradient mb-2">إتمام الدفع</h1>
        <p className="text-muted-foreground mb-6">حوّل المبلغ ثم ارفع صورة إثبات الدفع لتفعيل اشتراكك.</p>

        <div className="gradient-card border border-border/60 rounded-2xl p-5 mb-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs text-muted-foreground">الباقة</div>
            <div className="font-bold text-lg">{pkg.name}</div>
            <div className="text-xs text-muted-foreground mt-1">{pkg.duration_days} يوم</div>
          </div>
          <div className="text-2xl font-bold text-primary">{formatIQD(pkg.price_iqd)}</div>
        </div>

        <div className="gradient-card border border-border/60 rounded-2xl p-5 mb-5">
          <div className="flex items-center gap-2 mb-3"><CreditCard className="size-5 text-primary" /><h2 className="font-bold">معلومات التحويل</h2></div>
          <Label className="text-xs">رقم الماستر كارد</Label>
          <div className="flex items-center gap-2 mt-1">
            <Input readOnly value={MASTERCARD_NUMBER} className="font-mono text-lg tracking-widest" />
            <Button type="button" variant="outline" onClick={() => copy(MASTERCARD_NUMBER, "الرقم")}>
              <Copy className="size-4 ml-1" /> نسخ
            </Button>
          </div>
          <Label className="text-xs mt-4 block">كود التحقق (ضعه في ملاحظة التحويل)</Label>
          <div className="flex items-center gap-2 mt-1">
            <Input readOnly value={code} className="font-mono" />
            <Button type="button" variant="outline" onClick={() => copy(code, "كود التحقق")}>
              <Copy className="size-4 ml-1" /> نسخ
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            ⚠️ بدون إدراج كود التحقق في ملاحظات التحويل قد يتأخر تفعيل اشتراكك.
          </p>
        </div>

        <form onSubmit={submit} className="gradient-card border border-border/60 rounded-2xl p-5 space-y-4">
          <h2 className="font-bold flex items-center gap-2"><Check className="size-5 text-primary" /> بياناتك</h2>
          <div>
            <Label htmlFor="full_name">الاسم الكامل</Label>
            <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="file">صورة إثبات الدفع</Label>
            <div className="mt-1 border-2 border-dashed border-border rounded-xl p-6 text-center bg-secondary/30">
              <input
                id="file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <label htmlFor="file" className="cursor-pointer flex flex-col items-center gap-2">
                <Upload className="size-8 text-primary" />
                <div className="text-sm">{file ? file.name : "اضغط لاختيار صورة (PNG/JPG/WEBP حتى 5MB)"}</div>
              </label>
            </div>
          </div>
          <Button disabled={loading} className="w-full gradient-primary">
            {loading ? "جارٍ الإرسال..." : "إرسال الطلب"}
          </Button>
        </form>
      </main>
      <Footer />
    </div>
  );
}
