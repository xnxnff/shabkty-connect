import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'شبكتي ستور — متجر VPN عبر تلغرام' },
      { name: 'description', content: 'متجر شبكتي للـ VPN — اطلب باقتك مباشرة عبر بوت تلغرام.' },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at top, #1a0508 0%, #000 70%)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: '100%',
          background: 'linear-gradient(180deg, #15080a 0%, #0a0203 100%)',
          border: '1px solid #3a0f14',
          borderRadius: 24,
          padding: '40px 28px',
          textAlign: 'center',
          boxShadow: '0 30px 80px -20px rgba(180,20,40,0.4)',
        }}
      >
        <div style={{ fontSize: 64, marginBottom: 16 }}>🌐</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px' }}>
          شبكتي ستور
        </h1>
        <p style={{ color: '#c9a4ac', margin: '0 0 28px', lineHeight: 1.7 }}>
          متجر VPN احترافي — جميع الطلبات والدفع والتفعيل تتم الآن
          <br /> مباشرة عبر <b style={{ color: '#fff' }}>بوت تلغرام</b>.
        </p>
        <a
          href="https://t.me/shabkty_bot"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block',
            background: 'linear-gradient(135deg, #b71c2c 0%, #7a0e18 100%)',
            color: '#fff',
            textDecoration: 'none',
            padding: '16px 32px',
            borderRadius: 14,
            fontWeight: 700,
            fontSize: 17,
            boxShadow: '0 10px 30px -8px rgba(183,28,44,0.6)',
          }}
        >
          ابدأ عبر تلغرام ←
        </a>
        <p style={{ color: '#6b4248', margin: '28px 0 0', fontSize: 13 }}>
          اضغط /start داخل البوت لعرض الباقات والطلب.
        </p>
      </div>
    </div>
  );
}
