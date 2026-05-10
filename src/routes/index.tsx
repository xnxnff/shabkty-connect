import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer, TELEGRAM_URL, INSTAGRAM_URL } from "@/components/Footer";
import { AdPopup } from "@/components/AdPopup";
import { Button } from "@/components/ui/button";
import { Shield, Zap, Globe, Send, Instagram, ArrowLeft, Crown, User } from "lucide-react";
import { formatIQD } from "@/lib/payment";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "شبكتي ستور — اشتراكات VPN آمنة وسريعة" },
      { name: "description", content: "اشتراكات شخصية وبرجية مع Cinemana و Cinema Box و V2Ray و WireGuard." },
    ],
  }),
  component: Index,
});

const personal = [
  { label: "شهر واحد", days: 30, price: 3000 },
  { label: "شهرين", days: 60, price: 5000 },
  { label: "6 أشهر", days: 180, price: 15000 },
  { label: "سنة كاملة", days: 365, price: 25000 },
];
const tower = [
  { label: "شهر واحد", days: 30, price: 40000 },
  { label: "شهرين", days: 60, price: 70000 },
  { label: "6 أشهر", days: 180, price: 150000 },
  { label: "سنة كاملة", days: 365, price: 250000 },
];

function Index() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <AdPopup />
      <main className="flex-1">
        {/* Hero */}
        <section className="gradient-hero relative overflow-hidden">
          <div className="container mx-auto px-4 py-20 md:py-32 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs mb-6 animate-fade-up">
              <Shield className="size-3.5" /> اتصال آمن • سرعة عالية • دعم عراقي
            </div>
            <h1 className="text-4xl md:text-6xl font-black mb-5 animate-fade-up">
              <span className="text-gradient">شبكتي ستور</span>
              <br />
              <span className="text-foreground">VPN احترافي بأمان كامل</span>
            </h1>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-8 animate-fade-up">
              اشتراكات شخصية وبرجية تشمل Cinemana و Cinema Box وكونفجات V2Ray و WireGuard — تسليم فوري بعد التحقق من الدفع.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 animate-fade-up">
              <Button asChild size="lg" className="gradient-primary shadow-glow text-base">
                <Link to="/packages">تصفح الباقات <ArrowLeft className="size-4 mr-1" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="text-base">
                <a href={TELEGRAM_URL} target="_blank" rel="noreferrer"><Send className="size-4 ml-1" /> تيليجرام</a>
              </Button>
              <Button asChild size="lg" variant="outline" className="text-base">
                <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer"><Instagram className="size-4 ml-1" /> @s88i</a>
              </Button>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="container mx-auto px-4 py-16 grid md:grid-cols-3 gap-5">
          {[
            { icon: Shield, title: "تشفير عالي", desc: "حماية كاملة لبياناتك مع أحدث بروتوكولات الأمان." },
            { icon: Zap, title: "سرعة قصوى", desc: "خوادم متعددة تضمن سرعة اتصال ممتازة." },
            { icon: Globe, title: "خدمات إضافية", desc: "Cinemana، Cinema Box، V2Ray، WireGuard." },
          ].map((f) => (
            <div key={f.title} className="gradient-card p-6 rounded-2xl border border-border/60 shadow-elegant">
              <div className="size-12 rounded-xl gradient-primary flex items-center justify-center mb-4">
                <f.icon className="size-6 text-primary-foreground" />
              </div>
              <h3 className="font-bold text-lg mb-1">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </section>

        {/* Plans */}
        <section className="container mx-auto px-4 py-12">
          <PlansBlock title="اشتراك شخصي" icon={User} items={personal} highlight={false} />
          <div className="h-10" />
          <PlansBlock title="اشتراك برج" icon={Crown} items={tower} highlight />
          <div className="text-center text-sm text-muted-foreground mt-6">
            جميع الاشتراكات تشمل: Cinemana • Cinema Box • V2Ray Configs • WireGuard Configs
          </div>
        </section>

        {/* CTA */}
        <section className="container mx-auto px-4 py-16">
          <div className="gradient-card border border-border/60 rounded-3xl p-10 text-center shadow-elegant">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">جاهز للاشتراك؟</h2>
            <p className="text-muted-foreground mb-6">سجّل دخولك واختر الباقة المناسبة وارفع إثبات الدفع — يتم التفعيل خلال دقائق.</p>
            <Button asChild size="lg" className="gradient-primary shadow-glow">
              <Link to="/packages">ابدأ الآن</Link>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function PlansBlock({
  title, items, highlight, icon: Icon,
}: {
  title: string;
  items: { label: string; days: number; price: number }[];
  highlight: boolean;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <Icon className="size-5 text-primary" />
        <h2 className="text-2xl font-bold">{title}</h2>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((p) => (
          <div
            key={p.label}
            className={`rounded-2xl p-5 border transition hover:-translate-y-1 hover:shadow-glow ${
              highlight
                ? "border-primary/40 gradient-card"
                : "border-border/60 bg-card"
            }`}
          >
            <div className="text-xs text-muted-foreground mb-2">{p.label}</div>
            <div className="text-2xl font-bold mb-1">{formatIQD(p.price)}</div>
            <div className="text-xs text-muted-foreground">{p.days} يوم</div>
          </div>
        ))}
      </div>
    </div>
  );
}
