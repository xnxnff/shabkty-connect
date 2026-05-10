import { Send, Instagram } from "lucide-react";

export const TELEGRAM_URL = "https://t.me/SHABAKATY_STORE";
export const INSTAGRAM_URL = "https://instagram.com/s88i";

export function Footer() {
  return (
    <footer className="border-t border-border/60 mt-16">
      <div className="container mx-auto px-4 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="text-sm text-muted-foreground text-center md:text-right">
          © {new Date().getFullYear()} شبكتي ستور — جميع الحقوق محفوظة
        </div>
        <div className="flex items-center gap-3">
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary hover:bg-accent transition shadow-elegant"
          >
            <Send className="size-4" />
            <span className="text-sm">تيليجرام</span>
          </a>
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-primary text-primary-foreground hover:opacity-90 transition shadow-glow"
          >
            <Instagram className="size-4" />
            <span className="text-sm">انستغرام @s88i</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
