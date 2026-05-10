import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LogOut, Menu, ShieldCheck, User2, X } from "lucide-react";
import { useState } from "react";

export function Header() {
  const { session, signOut, isAdmin } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  const links = [
    { to: "/", label: "الرئيسية" },
    { to: "/packages", label: "الباقات" },
  ] as const;

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/70 border-b border-border/60">
      <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="size-9 rounded-xl gradient-primary shadow-glow flex items-center justify-center font-bold text-primary-foreground">
            ش
          </div>
          <div className="leading-tight">
            <div className="font-bold text-lg text-gradient">شبكتي ستور</div>
            <div className="text-[10px] text-muted-foreground">SHABKTY STORE</div>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition"
              activeProps={{ className: "px-3 py-2 rounded-lg text-sm text-foreground bg-secondary" }}
            >
              {l.label}
            </Link>
          ))}
          {session && (
            <Link
              to="/dashboard"
              className="px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition"
              activeProps={{ className: "px-3 py-2 rounded-lg text-sm text-foreground bg-secondary" }}
            >
              لوحتي
            </Link>
          )}
          {isAdmin && (
            <Link
              to="/shabkty-control-x9k2"
              className="px-3 py-2 rounded-lg text-sm text-primary hover:bg-secondary/60 transition flex items-center gap-1"
            >
              <ShieldCheck className="size-4" /> الإدارة
            </Link>
          )}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          {session ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => nav({ to: "/dashboard" })}>
                <User2 className="size-4 ml-1" /> حسابي
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => { await signOut(); nav({ to: "/" }); }}
              >
                <LogOut className="size-4 ml-1" /> خروج
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => nav({ to: "/login" })}>
                دخول
              </Button>
              <Button size="sm" onClick={() => nav({ to: "/register" })} className="gradient-primary">
                تسجيل
              </Button>
            </>
          )}
        </div>

        <button
          className="md:hidden p-2 rounded-lg hover:bg-secondary"
          onClick={() => setOpen((v) => !v)}
          aria-label="menu"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-border/60 bg-background/95">
          <div className="container mx-auto px-4 py-3 flex flex-col gap-1">
            {links.map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="px-3 py-2 rounded-lg text-sm hover:bg-secondary">
                {l.label}
              </Link>
            ))}
            {session && (
              <Link to="/dashboard" onClick={() => setOpen(false)} className="px-3 py-2 rounded-lg text-sm hover:bg-secondary">
                لوحتي
              </Link>
            )}
            {isAdmin && (
              <Link to="/shabkty-control-x9k2" onClick={() => setOpen(false)} className="px-3 py-2 rounded-lg text-sm text-primary hover:bg-secondary">
                لوحة الإدارة
              </Link>
            )}
            <div className="flex gap-2 pt-2">
              {session ? (
                <Button className="flex-1" variant="outline" onClick={async () => { await signOut(); setOpen(false); nav({ to: "/" }); }}>
                  تسجيل الخروج
                </Button>
              ) : (
                <>
                  <Button className="flex-1" variant="outline" onClick={() => { setOpen(false); nav({ to: "/login" }); }}>دخول</Button>
                  <Button className="flex-1 gradient-primary" onClick={() => { setOpen(false); nav({ to: "/register" }); }}>تسجيل</Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
