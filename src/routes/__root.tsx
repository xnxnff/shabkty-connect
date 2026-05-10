import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center gradient-card p-10 rounded-2xl shadow-elegant border border-border/60">
        <h1 className="text-7xl font-bold text-gradient">404</h1>
        <h2 className="mt-4 text-xl font-semibold">الصفحة غير موجودة</h2>
        <p className="mt-2 text-sm text-muted-foreground">الرابط الذي طلبته غير متوفر.</p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md gradient-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition"
        >
          العودة للرئيسية
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center gradient-card p-10 rounded-2xl border border-border/60">
        <h1 className="text-xl font-semibold">حدث خطأ ما</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-md gradient-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            إعادة المحاولة
          </button>
          <a href="/" className="rounded-md border border-border bg-secondary px-4 py-2 text-sm">الرئيسية</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "شبكتي ستور — متجر اشتراكات VPN" },
      { name: "description", content: "اشتراكات VPN آمنة وسريعة مع Cinemana و Cinema Box و V2Ray و WireGuard." },
      { property: "og:title", content: "شبكتي ستور — متجر اشتراكات VPN" },
      { property: "og:description", content: "اشتراكات VPN آمنة وسريعة مع Cinemana و Cinema Box و V2Ray و WireGuard." },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "شبكتي ستور — متجر اشتراكات VPN" },
      { name: "twitter:description", content: "اشتراكات VPN آمنة وسريعة مع Cinemana و Cinema Box و V2Ray و WireGuard." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/559ce2c7-8e6b-414c-b3e9-c1ee24f5f757/id-preview-acc50764--5be4a043-b7d8-4355-b627-c89ae9a380cc.lovable.app-1778416682962.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/559ce2c7-8e6b-414c-b3e9-c1ee24f5f757/id-preview-acc50764--5be4a043-b7d8-4355-b627-c89ae9a380cc.lovable.app-1778416682962.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Tajawal:wght@500;700;900&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster richColors position="top-center" dir="rtl" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
