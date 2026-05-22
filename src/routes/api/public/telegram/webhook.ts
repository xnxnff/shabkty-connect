import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';
import { createHash, timingSafeEqual } from 'crypto';

// ============ Constants ============
const MASTERCARD = '8557885855';

// ============ Helpers ============
function tokenSecret(token: string) {
  return createHash('sha256').update('telegram-webhook:' + token).digest('base64url');
}
function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
function esc(s: string) {
  return String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
}
function fmtIQD(n: number) {
  return new Intl.NumberFormat('ar-IQ').format(n) + ' د.ع';
}
function genCode() {
  const p = () => Math.floor(1000 + Math.random() * 9000).toString();
  return `SHB-${p()}-${p()}`;
}

let _sb: any = null;
function sb(): any {
  if (!_sb) {
    _sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
  }
  return _sb;
}

const BOT = () => process.env.TELEGRAM_BOT_TOKEN!;
const ADMIN = () => Number(process.env.TELEGRAM_ADMIN_CHAT_ID!);

async function tg(method: string, body: any) {
  const r = await fetch(`https://api.telegram.org/bot${BOT()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}
const sendMessage = (chat_id: number, text: string, extra: any = {}) =>
  tg('sendMessage', { chat_id, text, parse_mode: 'HTML', ...extra });
const sendPhoto = (chat_id: number, photo: string, caption: string, extra: any = {}) =>
  tg('sendPhoto', { chat_id, photo, caption, parse_mode: 'HTML', ...extra });
const answerCb = (id: string, text?: string) =>
  tg('answerCallbackQuery', { callback_query_id: id, text });

// ============ Session ============
async function getState(userId: number): Promise<any> {
  const { data } = await sb()
    .from('telegram_sessions')
    .select('state')
    .eq('telegram_user_id', userId)
    .maybeSingle();
  return (data as any)?.state || {};
}
async function setState(userId: number, chatId: number, state: any) {
  await sb()
    .from('telegram_sessions')
    .upsert({
      telegram_user_id: userId,
      chat_id: chatId,
      state,
      updated_at: new Date().toISOString(),
    });
}
const clearState = (u: number, c: number) => setState(u, c, {});

// ============ UI ============
function mainMenu(userId: number) {
  const rows: any[][] = [
    [{ text: '🛍 الباقات' }],
    [{ text: '📦 طلباتي' }, { text: '🆘 الدعم' }],
  ];
  if (userId === ADMIN()) rows.push([{ text: '👑 لوحة الأدمن' }]);
  return { reply_markup: { keyboard: rows, resize_keyboard: true } };
}

async function showMain(chatId: number, userId: number, name?: string) {
  const greet = name ? `أهلاً <b>${esc(name)}</b>` : 'أهلاً بك';
  await sendMessage(
    chatId,
    `${greet} في <b>متجر شبكتي 🌐</b>\n\nأفضل باقات الـ VPN بأسعار منافسة.\nاختر من القائمة بالأسفل:`,
    mainMenu(userId),
  );
}

async function showAdminPanel(chatId: number) {
  const [{ count: pend }, { count: pkgC }, { count: usersC }] = await Promise.all([
    sb().from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    sb().from('packages').select('*', { count: 'exact', head: true }),
    sb().from('telegram_sessions').select('*', { count: 'exact', head: true }),
  ]);
  await sendMessage(
    chatId,
    `👑 <b>لوحة الأدمن</b>\n\n` +
      `⏳ طلبات قيد المراجعة: <b>${pend || 0}</b>\n` +
      `📦 الباقات: <b>${pkgC || 0}</b>\n` +
      `👥 المستخدمون: <b>${usersC || 0}</b>\n`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📦 إدارة الباقات', callback_data: 'a:pkgs' }],
          [{ text: '⏳ الطلبات المعلقة', callback_data: 'a:pending' }],
          [{ text: '👥 المستخدمون', callback_data: 'a:users' }],
          [{ text: '📢 إرسال إعلان', callback_data: 'a:bcast' }],
          [{ text: '📊 إحصائيات', callback_data: 'a:stats' }],
        ],
      },
    },
  );
}


async function showPackages(chatId: number) {
  const { data: pkgs } = await sb()
    .from('packages')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  const list = (pkgs || []) as any[];
  if (list.length === 0) {
    await sendMessage(chatId, 'لا توجد باقات متاحة حالياً.');
    return;
  }
  await sendMessage(chatId, `<b>🛍 الباقات المتاحة (${list.length})</b>`);
  for (const p of list) {
    const caption =
      `<b>${esc(p.name)}</b>\n` +
      (p.description ? `${esc(p.description)}\n` : '') +
      `\n💰 السعر: <b>${fmtIQD(p.price_iqd)}</b>\n` +
      `📅 المدة: <b>${p.duration_days} يوم</b>`;
    const kb = { inline_keyboard: [[{ text: '🛒 اطلب الآن', callback_data: `buy:${p.id}` }]] };
    if (p.image_url) {
      await sendPhoto(chatId, p.image_url, caption, { reply_markup: kb });
    } else {
      await sendMessage(chatId, caption, { reply_markup: kb });
    }
  }
}

async function showMyOrders(userId: number, chatId: number) {
  const { data: orders } = await sb()
    .from('orders')
    .select('*, packages(name)')
    .eq('telegram_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);
  const list = (orders || []) as any[];
  if (list.length === 0) {
    await sendMessage(chatId, '📭 لا توجد طلبات بعد.\nاضغط 🛍 الباقات لبدء طلب جديد.');
    return;
  }
  await sendMessage(chatId, `<b>📦 طلباتك (${list.length})</b>`);
  for (const o of list) {
    const stMap: any = {
      pending: '⏳ قيد المراجعة',
      approved: '✅ مفعّل',
      rejected: '❌ مرفوض',
    };
    let body =
      `📦 <b>${esc(o.packages?.name || '')}</b>\n` +
      `الحالة: ${stMap[o.status] || o.status}\n` +
      `🔖 كود التحقق: <code>${esc(o.verification_code)}</code>\n` +
      `📆 ${new Date(o.created_at).toLocaleString('ar-IQ')}`;
    if (o.status === 'approved' && o.delivered_code) {
      body += `\n\n🔑 <b>كود الاشتراك:</b>\n<code>${esc(o.delivered_code)}</code>`;
      if (o.expires_at)
        body += `\n📅 ينتهي: ${new Date(o.expires_at).toLocaleDateString('ar-IQ')}`;
    }
    if (o.status === 'rejected' && o.admin_note) {
      body += `\n💬 السبب: ${esc(o.admin_note)}`;
    }
    await sendMessage(chatId, body);
  }
}

// ============ Order Flow ============
async function startOrder(userId: number, chatId: number, pkgId: string) {
  const { data: pkg } = await sb().from('packages').select('*').eq('id', pkgId).maybeSingle();
  if (!pkg) {
    await sendMessage(chatId, '⚠️ الباقة غير متاحة.');
    return;
  }
  await setState(userId, chatId, { step: 'await_name', package_id: pkgId });
  await sendMessage(
    chatId,
    `🛒 اخترت: <b>${esc((pkg as any).name)}</b>\n💰 ${fmtIQD((pkg as any).price_iqd)}\n\n` +
      `الخطوة 1️⃣ من 3️⃣\nأرسل <b>اسمك الكامل</b>:`,
  );
}

async function handleText(msg: any) {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const text: string = (msg.text || '').trim();
  const state = await getState(userId);

  // ===== Admin reply flows =====
  if (userId === ADMIN()) {
    if (state.step === 'admin_await_code') {
      const code = text;
      await sb()
        .from('orders')
        .update({ delivered_code: code, status: 'approved' })
        .eq('id', state.order_id);
      const { data: order } = await sb()
        .from('orders')
        .select('*')
        .eq('id', state.order_id)
        .maybeSingle();
      const o: any = order;
      if (o?.telegram_chat_id) {
        await sendMessage(
          Number(o.telegram_chat_id),
          `✅ <b>تم قبول طلبك وتفعيل اشتراكك!</b>\n\n🔑 <b>كود الاشتراك:</b>\n<code>${esc(code)}</code>\n\n` +
            (o.expires_at
              ? `📅 ينتهي: ${new Date(o.expires_at).toLocaleDateString('ar-IQ')}\n\n`
              : '') +
            `شكراً لاختيارك متجر شبكتي 🌐`,
        );
      }
      await sendMessage(chatId, '✅ تم تسليم الكود للزبون.');
      await clearState(userId, chatId);
      return;
    }
    if (state.step === 'admin_await_reject_reason') {
      await sb()
        .from('orders')
        .update({ status: 'rejected', admin_note: text })
        .eq('id', state.order_id);
      const { data: order } = await sb()
        .from('orders')
        .select('telegram_chat_id')
        .eq('id', state.order_id)
        .maybeSingle();
      const o: any = order;
      if (o?.telegram_chat_id) {
        await sendMessage(
          Number(o.telegram_chat_id),
          `❌ <b>تم رفض طلبك</b>\n\n💬 السبب: ${esc(text)}\n\nيرجى مراجعة الدفع وإعادة الطلب.`,
        );
      }
      await sendMessage(chatId, '✅ تم إبلاغ الزبون بالرفض.');
      await clearState(userId, chatId);
      return;
    }
  }

  // ===== Main commands / keyboard =====
  if (text === '/start' || text === '/menu') {
    await clearState(userId, chatId);
    await showMain(chatId, msg.from.first_name);
    return;
  }
  if (text === '🛍 الباقات' || text === '/packages') return showPackages(chatId);
  if (text === '📦 طلباتي' || text === '/orders') return showMyOrders(userId, chatId);
  if (text === '🆘 الدعم' || text === '/support') {
    await sendMessage(
      chatId,
      `<b>🆘 الدعم الفني</b>\n\nللتواصل مع الدعم:\n👤 @shabkty_support\n\nأو أرسل رسالتك وسيتم الرد قريباً.`,
    );
    return;
  }
  if (userId === ADMIN() && text === '/admin') {
    const { count: pend } = await sb()
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    await sendMessage(
      chatId,
      `👑 <b>لوحة الأدمن</b>\n\n⏳ طلبات قيد المراجعة: <b>${pend || 0}</b>\n\nستصلك إشعارات تلقائية بكل طلب جديد.`,
    );
    return;
  }

  // ===== Order flow =====
  if (state.step === 'await_name') {
    if (text.length < 2) {
      await sendMessage(chatId, '⚠️ الاسم قصير، أعد الإرسال:');
      return;
    }
    await setState(userId, chatId, { ...state, full_name: text, step: 'await_payment' });
    await sendMessage(
      chatId,
      `📛 الاسم: <b>${esc(text)}</b>\n\nالخطوة 2️⃣ من 3️⃣\n\n` +
        `💳 <b>طريقة الدفع: ماستر كارد</b>\n` +
        `حوّل المبلغ إلى الرقم التالي:\n\n<code>${MASTERCARD}</code>\n\n` +
        `الخطوة 3️⃣ من 3️⃣\n` +
        `📸 أرسل الآن <b>صورة وصل الدفع</b>.`,
    );
    return;
  }

  await showMain(chatId, msg.from.first_name);
}

async function handlePhoto(msg: any) {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const state = await getState(userId);
  if (state.step !== 'await_payment') {
    await sendMessage(chatId, 'لبدء طلب جديد اضغط 🛍 الباقات أولاً.');
    return;
  }
  const photos = msg.photo;
  const largest = photos[photos.length - 1];

  const f: any = await tg('getFile', { file_id: largest.file_id });
  if (!f.ok) {
    await sendMessage(chatId, '⚠️ تعذّر جلب الصورة، حاول مرة أخرى.');
    return;
  }
  const filePath: string = f.result.file_path;
  const dl = await fetch(`https://api.telegram.org/file/bot${BOT()}/${filePath}`);
  if (!dl.ok) {
    await sendMessage(chatId, '⚠️ فشل تنزيل الصورة.');
    return;
  }
  const buf = new Uint8Array(await dl.arrayBuffer());
  const ext = (filePath.split('.').pop() || 'jpg').toLowerCase();
  const storagePath = `tg/${userId}/${Date.now()}.${ext}`;
  const up = await sb()
    .storage.from('payment-screenshots')
    .upload(storagePath, buf, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
  if (up.error) {
    await sendMessage(chatId, '⚠️ فشل رفع الصورة: ' + up.error.message);
    return;
  }
  const { data: signed } = await sb()
    .storage.from('payment-screenshots')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365);

  const code = genCode();
  const { data: ins, error } = await sb()
    .from('orders')
    .insert({
      package_id: state.package_id,
      full_name: state.full_name,
      verification_code: code,
      payment_screenshot_url: storagePath,
      telegram_user_id: userId,
      telegram_chat_id: chatId,
      user_id: null,
    })
    .select()
    .single();
  if (error) {
    await sendMessage(chatId, '⚠️ تعذّر إنشاء الطلب: ' + error.message);
    return;
  }

  await clearState(userId, chatId);
  await sendMessage(
    chatId,
    `✅ <b>تم استلام طلبك بنجاح!</b>\n\n` +
      `🔖 كود التحقق:\n<code>${code}</code>\n\n` +
      `⏳ سيقوم الفريق بمراجعة الدفع وتفعيل اشتراكك خلال دقائق.\nستصلك رسالة فور التفعيل.`,
    MAIN_MENU,
  );

  // Notify admin
  const { data: pkg } = await sb()
    .from('packages')
    .select('name, price_iqd, duration_days')
    .eq('id', state.package_id)
    .maybeSingle();
  const p: any = pkg || {};
  const caption =
    `🆕 <b>طلب جديد</b>\n\n` +
    `👤 الاسم: <b>${esc(state.full_name)}</b>\n` +
    `🆔 تلغرام: <code>${userId}</code>` +
    (msg.from.username ? ` (@${esc(msg.from.username)})` : '') +
    `\n📦 الباقة: <b>${esc(p.name || '')}</b>\n` +
    `💰 السعر: <b>${fmtIQD(p.price_iqd || 0)}</b>\n` +
    `📅 المدة: ${p.duration_days || '-'} يوم\n` +
    `🔖 كود التحقق: <code>${code}</code>`;
  const kb = {
    inline_keyboard: [
      [
        { text: '✅ قبول', callback_data: `appr:${(ins as any).id}` },
        { text: '❌ رفض', callback_data: `rej:${(ins as any).id}` },
      ],
    ],
  };
  if (signed?.signedUrl) {
    await sendPhoto(ADMIN(), signed.signedUrl, caption, { reply_markup: kb });
  } else {
    await sendMessage(ADMIN(), caption, { reply_markup: kb });
  }
}

async function handleCallback(cb: any) {
  const data: string = cb.data || '';
  const userId = cb.from.id;
  const chatId = cb.message.chat.id;
  await answerCb(cb.id);

  if (data.startsWith('buy:')) {
    return startOrder(userId, chatId, data.slice(4));
  }

  if (userId !== ADMIN()) {
    await sendMessage(chatId, '⛔ هذا الإجراء للأدمن فقط.');
    return;
  }

  if (data.startsWith('appr:')) {
    const orderId = data.slice(5);
    await setState(userId, chatId, { step: 'admin_await_code', order_id: orderId });
    await sendMessage(
      chatId,
      '✏️ أرسل الآن <b>كود الاشتراك (VPN)</b> الذي سيُسلَّم للزبون:',
    );
    return;
  }
  if (data.startsWith('rej:')) {
    const orderId = data.slice(4);
    await setState(userId, chatId, { step: 'admin_await_reject_reason', order_id: orderId });
    await sendMessage(chatId, '✏️ أرسل <b>سبب الرفض</b>:');
    return;
  }
}

// ============ Route ============
export const Route = createFileRoute('/api/public/telegram/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) return new Response('Bot not configured', { status: 500 });
        const expected = tokenSecret(token);
        const got = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
        if (!safeEqual(got, expected)) {
          return new Response('Unauthorized', { status: 401 });
        }
        try {
          const update = await request.json();
          if (update.message) {
            const m = update.message;
            if (m.photo) await handlePhoto(m);
            else if (m.text) await handleText(m);
          } else if (update.callback_query) {
            await handleCallback(update.callback_query);
          }
        } catch (e: any) {
          console.error('tg webhook error', e?.message || e);
        }
        return Response.json({ ok: true });
      },
      GET: async () => new Response('ok'),
    },
  },
});
