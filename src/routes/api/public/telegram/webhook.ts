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
  return String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
}
function fmtIQD(n: number) {
  return new Intl.NumberFormat('ar-IQ').format(n) + ' د.ع';
}
function genCode() {
  const p = () => Math.floor(1000 + Math.random() * 9000).toString();
  return `SHB-${p()}-${p()}`;
}
function genRef() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
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

// Settings cache
const _settings: Record<string, string> = {};
async function getSetting(key: string, fallback = ''): Promise<string> {
  if (_settings[key] !== undefined) return _settings[key];
  const { data } = await sb().from('bot_settings').select('value').eq('key', key).maybeSingle();
  const v = (data as any)?.value ?? fallback;
  _settings[key] = v;
  return v;
}
async function setSetting(key: string, value: string) {
  await sb().from('bot_settings').upsert({ key, value, updated_at: new Date().toISOString() });
  _settings[key] = value;
}

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
const sendVideo = (chat_id: number, video: string, caption: string, extra: any = {}) =>
  tg('sendVideo', { chat_id, video, caption, parse_mode: 'HTML', ...extra });
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

// ============ Points / referrals ============
async function getOrCreatePoints(userId: number): Promise<any> {
  const { data } = await sb()
    .from('user_points')
    .select('*')
    .eq('telegram_user_id', userId)
    .maybeSingle();
  if (data) return data;
  let code = genRef();
  // ensure uniqueness
  for (let i = 0; i < 5; i++) {
    const { data: ex } = await sb()
      .from('user_points')
      .select('telegram_user_id')
      .eq('referral_code', code)
      .maybeSingle();
    if (!ex) break;
    code = genRef();
  }
  const { data: ins } = await sb()
    .from('user_points')
    .insert({ telegram_user_id: userId, referral_code: code, points: 0 })
    .select()
    .single();
  return ins;
}
async function applyReferral(newUserId: number, refCode: string) {
  const me = await getOrCreatePoints(newUserId);
  if ((me as any).referred_by) return; // already referred
  const { data: ref } = await sb()
    .from('user_points')
    .select('telegram_user_id')
    .eq('referral_code', refCode.toUpperCase())
    .maybeSingle();
  if (!ref || (ref as any).telegram_user_id === newUserId) return;
  const refUid = Number((ref as any).telegram_user_id);
  const ppr = parseInt(await getSetting('points_per_referral', '10'), 10) || 0;
  await sb()
    .from('user_points')
    .update({ referred_by: refUid })
    .eq('telegram_user_id', newUserId);
  // increment referrer points
  const { data: r } = await sb()
    .from('user_points')
    .select('points')
    .eq('telegram_user_id', refUid)
    .maybeSingle();
  const newPts = ((r as any)?.points || 0) + ppr;
  await sb().from('user_points').update({ points: newPts }).eq('telegram_user_id', refUid);
  // notify referrer
  const { data: sess } = await sb()
    .from('telegram_sessions')
    .select('chat_id')
    .eq('telegram_user_id', refUid)
    .maybeSingle();
  if (sess) {
    await sendMessage(
      Number((sess as any).chat_id),
      `🎉 صديق جديد انضمّ عبر رابطك! حصلت على <b>+${ppr}</b> نقطة.`,
    );
  }
}

async function getBotUsername(): Promise<string> {
  let u = _settings['__bot_username'];
  if (u) return u;
  const r: any = await tg('getMe', {});
  u = r?.result?.username || '';
  _settings['__bot_username'] = u;
  return u;
}

// ============ UI ============
function mainMenu(userId: number) {
  const rows: any[][] = [
    [{ text: '🛍 الباقات' }],
    [{ text: '📦 طلباتي' }, { text: '🆘 الدعم' }],
    [{ text: '🎁 نقاطي' }, { text: '❓ كيف أستخدم الكود' }],
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
          [{ text: '🎁 إدارة النقاط', callback_data: 'a:points' }],
          [{ text: '⚙️ الإعدادات', callback_data: 'a:settings' }],
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
      (p.price_points ? `💎 أو بـ <b>${p.price_points}</b> نقطة\n` : '') +
      `📅 المدة: <b>${p.duration_days} يوم</b>`;
    const row: any[] = [{ text: '🛒 اطلب الآن', callback_data: `buy:${p.id}` }];
    if (p.price_points) row.push({ text: `💎 شراء بالنقاط (${p.price_points})`, callback_data: `pbuy:${p.id}` });
    const kb = { inline_keyboard: [row] };
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
    // If the code was delivered, treat as approved even if status lagged
    const effective = o.delivered_code ? 'approved' : o.status;
    const stMap: any = {
      pending: '⏳ قيد المراجعة',
      approved: '✅ مفعّل',
      rejected: '❌ مرفوض',
      expired: '⌛️ منتهٍ',
    };
    let body =
      `📦 <b>${esc(o.packages?.name || '')}</b>\n` +
      `الحالة: ${stMap[effective] || effective}\n` +
      `🔖 كود التحقق: <code>${esc(o.verification_code)}</code>\n` +
      `📆 ${new Date(o.created_at).toLocaleString('ar-IQ')}`;
    if (o.delivered_code) {
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

async function showPoints(userId: number, chatId: number) {
  const p = await getOrCreatePoints(userId);
  const username = await getBotUsername();
  const ppr = await getSetting('points_per_referral', '10');
  const link = username ? `https://t.me/${username}?start=ref_${(p as any).referral_code}` : `(الكود) ${(p as any).referral_code}`;
  await sendMessage(
    chatId,
    `🎁 <b>نقاطك</b>\n\n` +
      `💎 الرصيد: <b>${(p as any).points || 0}</b> نقطة\n` +
      `🔗 رمز الإحالة: <code>${(p as any).referral_code}</code>\n\n` +
      `شارك رابطك مع أصدقائك واحصل على <b>${ppr}</b> نقطة لكل صديق جديد:\n\n<code>${link}</code>`,
  );
}

async function showHowTo(chatId: number) {
  const txt = await getSetting('how_to_use', 'لم يتم ضبط الشرح بعد.');
  const vid = await getSetting('how_to_video_file_id', '');
  if (vid) {
    await sendVideo(chatId, vid, txt);
  } else {
    await sendMessage(chatId, txt);
  }
}

async function showSupport(chatId: number) {
  const u = await getSetting('support_username', 'xnxnff');
  await sendMessage(
    chatId,
    `<b>🆘 الدعم الفني</b>\n\nللتواصل مع الدعم:\n👤 @${esc(u)}\n\nأو أرسل رسالتك وسيتم الرد قريباً.`,
  );
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
            `للتعرف على طريقة الاستخدام اضغط زر «❓ كيف أستخدم الكود».\n\nشكراً لاختيارك متجر شبكتي 🌐`,
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

  // ===== Admin multi-step flows =====
  if (userId === ADMIN() && state.step && String(state.step).startsWith('a_')) {
    return handleAdminText(chatId, userId, text, state);
  }

  // ===== Main commands / keyboard =====
  if (text.startsWith('/start')) {
    await clearState(userId, chatId);
    await getOrCreatePoints(userId);
    // Handle referral payload: /start ref_XXXX
    const parts = text.split(/\s+/);
    if (parts[1] && parts[1].startsWith('ref_')) {
      await applyReferral(userId, parts[1].slice(4));
    }
    await showMain(chatId, userId, msg.from.first_name);
    return;
  }
  if (text === '/menu') {
    await clearState(userId, chatId);
    await showMain(chatId, userId, msg.from.first_name);
    return;
  }
  if (text === '🛍 الباقات' || text === '/packages') return showPackages(chatId);
  if (text === '📦 طلباتي' || text === '/orders') return showMyOrders(userId, chatId);
  if (text === '🎁 نقاطي' || text === '/points') return showPoints(userId, chatId);
  if (text === '❓ كيف أستخدم الكود' || text === '/howto') return showHowTo(chatId);
  if (text === '🆘 الدعم' || text === '/support') return showSupport(chatId);
  if (userId === ADMIN() && (text === '/admin' || text === '👑 لوحة الأدمن')) {
    return showAdminPanel(chatId);
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

  await showMain(chatId, userId, msg.from.first_name);
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
    mainMenu(userId),
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
  if (data.startsWith('pbuy:')) {
    return startPointsOrder(userId, chatId, data.slice(5));
  }
  if (data.startsWith('pbc:')) {
    // pbc:<pkgId> confirm points purchase
    return confirmPointsOrder(userId, chatId, data.slice(4));
  }

  if (userId !== ADMIN()) {
    await sendMessage(chatId, '⛔ هذا الإجراء للأدمن فقط.');
    return;
  }

  if (data.startsWith('appr:')) {
    const orderId = data.slice(5);
    await setState(userId, chatId, { step: 'admin_await_code', order_id: orderId });
    await sendMessage(chatId, '✏️ أرسل الآن <b>كود الاشتراك (VPN)</b> الذي سيُسلَّم للزبون:');
    return;
  }
  if (data.startsWith('rej:')) {
    const orderId = data.slice(4);
    await setState(userId, chatId, { step: 'admin_await_reject_reason', order_id: orderId });
    await sendMessage(chatId, '✏️ أرسل <b>سبب الرفض</b>:');
    return;
  }

  // Admin menu actions
  if (data === 'a:home') return showAdminPanel(chatId);
  if (data === 'a:pkgs') return adminListPackages(chatId);
  if (data === 'a:pending') return adminPendingOrders(chatId);
  if (data === 'a:users') return adminListUsers(chatId);
  if (data === 'a:stats') return adminStats(chatId);
  if (data === 'a:settings') return adminSettingsMenu(chatId);
  if (data === 'a:points') return adminPointsMenu(chatId);
  if (data === 'a:bcast') {
    await setState(userId, chatId, { step: 'a_bcast_text' });
    await sendMessage(chatId, '📢 أرسل نص الإعلان الذي تريد بثّه لجميع المستخدمين:');
    return;
  }
  if (data === 'pkg:new') {
    await setState(userId, chatId, { step: 'a_pkg_name', draft: {} });
    await sendMessage(chatId, '➕ <b>باقة جديدة</b>\n\nأرسل <b>اسم الباقة</b>:');
    return;
  }
  if (data.startsWith('pkg:v:')) {
    return adminViewPackage(chatId, data.slice(6));
  }
  if (data.startsWith('pkg:toggle:')) {
    const id = data.slice(11);
    const { data: cur } = await sb().from('packages').select('is_active').eq('id', id).maybeSingle();
    await sb().from('packages').update({ is_active: !(cur as any)?.is_active }).eq('id', id);
    return adminViewPackage(chatId, id);
  }
  if (data.startsWith('pkg:del:')) {
    const id = data.slice(8);
    await sb().from('packages').delete().eq('id', id);
    await sendMessage(chatId, '🗑 تم حذف الباقة.');
    return adminListPackages(chatId);
  }
  if (data.startsWith('pkg:edit:')) {
    const [, , , field, id] = data.split(':');
    await setState(userId, chatId, { step: `a_pkg_edit_${field}`, edit_id: id });
    const labels: any = { name: 'الاسم', desc: 'الوصف', price: 'السعر (د.ع)', dur: 'المدة (أيام)', img: 'رابط الصورة' };
    await sendMessage(chatId, `✏️ أرسل القيمة الجديدة لـ <b>${labels[field]}</b>:`);
    return;
  }
  if (data === 'a:bcast:send') {
    return adminSendBroadcast(chatId, userId);
  }
  if (data === 'a:bcast:cancel') {
    await clearState(userId, chatId);
    await sendMessage(chatId, '✖️ تم الإلغاء.');
    return showAdminPanel(chatId);
  }

  // Settings edits
  if (data.startsWith('set:edit:')) {
    const key = data.slice(9);
    await setState(userId, chatId, { step: 'a_set_value', set_key: key });
    const labels: any = {
      support_username: 'اسم مستخدم الدعم (بدون @)',
      points_per_referral: 'عدد النقاط لكل صديق',
      how_to_use: 'نص شرح كيفية استخدام الكود',
    };
    const cur = await getSetting(key, '');
    await sendMessage(
      chatId,
      `✏️ القيمة الحالية لـ <b>${labels[key] || key}</b>:\n<code>${esc(cur)}</code>\n\nأرسل القيمة الجديدة:`,
    );
    return;
  }

  // Points admin
  if (data === 'a:pts:add') {
    await setState(userId, chatId, { step: 'a_pts_uid' });
    await sendMessage(chatId, '🎁 أرسل <b>ID تلغرام الزبون</b>:');
    return;
  }

  // How-to video
  if (data === 'set:howto_video') {
    await setState(userId, chatId, { step: 'a_howto_video' });
    await sendMessage(chatId, '🎬 أرسل الآن <b>فيديو الشرح</b> (ارفعه كفيديو مباشرة):');
    return;
  }
  if (data === 'set:howto_video_del') {
    await setSetting('how_to_video_file_id', '');
    await sendMessage(chatId, '✅ تم حذف فيديو الشرح.');
    return adminSettingsMenu(chatId);
  }
}

// ============ Points purchase ============
async function startPointsOrder(userId: number, chatId: number, pkgId: string) {
  const { data: pkg } = await sb().from('packages').select('*').eq('id', pkgId).maybeSingle();
  const p: any = pkg;
  if (!p || !p.price_points) {
    await sendMessage(chatId, '⚠️ هذه الباقة غير متاحة للشراء بالنقاط.');
    return;
  }
  const up = await getOrCreatePoints(userId);
  const have = (up as any).points || 0;
  if (have < p.price_points) {
    await sendMessage(chatId, `⚠️ رصيدك غير كافٍ.\n💎 رصيدك: <b>${have}</b>\n💎 المطلوب: <b>${p.price_points}</b>\n\nاجمع نقاطاً عبر دعوة الأصدقاء من قسم 🎁 نقاطي.`);
    return;
  }
  await sendMessage(
    chatId,
    `🛒 <b>${esc(p.name)}</b>\n💎 السعر: <b>${p.price_points}</b> نقطة\n💎 رصيدك: <b>${have}</b>\n\nهل تريد تأكيد الشراء؟`,
    { reply_markup: { inline_keyboard: [[
      { text: '✅ تأكيد الشراء', callback_data: `pbc:${pkgId}` },
      { text: '✖️ إلغاء', callback_data: 'a:home' },
    ]] } },
  );
}

async function confirmPointsOrder(userId: number, chatId: number, pkgId: string) {
  const { data: pkg } = await sb().from('packages').select('*').eq('id', pkgId).maybeSingle();
  const p: any = pkg;
  if (!p || !p.price_points) {
    await sendMessage(chatId, '⚠️ غير متاحة.');
    return;
  }
  const up = await getOrCreatePoints(userId);
  const have = (up as any).points || 0;
  if (have < p.price_points) {
    await sendMessage(chatId, '⚠️ رصيدك غير كافٍ.');
    return;
  }
  // Deduct points first
  const newPts = have - p.price_points;
  await sb().from('user_points').update({ points: newPts }).eq('telegram_user_id', userId);

  const code = genCode();
  const fullName = 'دفع بالنقاط';
  const { data: ins, error } = await sb()
    .from('orders')
    .insert({
      package_id: pkgId,
      full_name: fullName,
      verification_code: code,
      payment_screenshot_url: 'POINTS',
      telegram_user_id: userId,
      telegram_chat_id: chatId,
      user_id: null,
      admin_note: `دفع بالنقاط — ${p.price_points} نقطة`,
    })
    .select()
    .single();
  if (error) {
    // refund
    await sb().from('user_points').update({ points: have }).eq('telegram_user_id', userId);
    await sendMessage(chatId, '⚠️ فشل إنشاء الطلب: ' + error.message);
    return;
  }
  await sendMessage(
    chatId,
    `✅ <b>تم استلام طلبك (دفع بالنقاط)!</b>\n\n` +
      `🔖 كود التحقق:\n<code>${code}</code>\n💎 خُصم: <b>${p.price_points}</b> نقطة\n💎 رصيدك الجديد: <b>${newPts}</b>\n\n⏳ سيتم تسليم كود الاشتراك خلال دقائق.`,
    mainMenu(userId),
  );
  // Notify admin
  const caption =
    `🆕 <b>طلب جديد (نقاط 💎)</b>\n\n` +
    `🆔 تلغرام: <code>${userId}</code>\n` +
    `📦 الباقة: <b>${esc(p.name)}</b>\n` +
    `💎 الدفع: <b>${p.price_points} نقطة</b>\n` +
    `🔖 كود التحقق: <code>${code}</code>`;
  await sendMessage(ADMIN(), caption, {
    reply_markup: { inline_keyboard: [[
      { text: '✅ قبول', callback_data: `appr:${(ins as any).id}` },
      { text: '❌ رفض', callback_data: `rej:${(ins as any).id}` },
    ]] },
  });
}

// ============ Admin helpers ============
async function adminListPackages(chatId: number) {
  const { data: pkgs } = await sb().from('packages').select('*').order('sort_order', { ascending: true });
  const list = (pkgs || []) as any[];
  const buttons: any[][] = list.map((p) => [
    { text: `${p.is_active ? '🟢' : '⚪️'} ${p.name} — ${fmtIQD(p.price_iqd)}`, callback_data: `pkg:v:${p.id}` },
  ]);
  buttons.push([{ text: '➕ إضافة باقة', callback_data: 'pkg:new' }]);
  buttons.push([{ text: '⬅️ رجوع', callback_data: 'a:home' }]);
  await sendMessage(chatId, `📦 <b>إدارة الباقات (${list.length})</b>`, {
    reply_markup: { inline_keyboard: buttons },
  });
}

async function adminViewPackage(chatId: number, id: string) {
  const { data: p } = await sb().from('packages').select('*').eq('id', id).maybeSingle();
  if (!p) {
    await sendMessage(chatId, 'الباقة غير موجودة.');
    return;
  }
  const pkg: any = p;
  const body =
    `📦 <b>${esc(pkg.name)}</b>\n` +
    `الحالة: ${pkg.is_active ? '🟢 مفعّلة' : '⚪️ متوقفة'}\n` +
    `💰 ${fmtIQD(pkg.price_iqd)}\n` +
    `📅 ${pkg.duration_days} يوم\n` +
    (pkg.description ? `📝 ${esc(pkg.description)}\n` : '') +
    (pkg.image_url ? `🖼 ${esc(pkg.image_url)}\n` : '');
  await sendMessage(chatId, body, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✏️ الاسم', callback_data: `pkg:edit:f:name:${id}` },
          { text: '💰 السعر', callback_data: `pkg:edit:f:price:${id}` },
        ],
        [
          { text: '📅 المدة', callback_data: `pkg:edit:f:dur:${id}` },
          { text: '📝 الوصف', callback_data: `pkg:edit:f:desc:${id}` },
        ],
        [{ text: '🖼 الصورة', callback_data: `pkg:edit:f:img:${id}` }],
        [{ text: pkg.is_active ? '⏸ إيقاف' : '▶️ تفعيل', callback_data: `pkg:toggle:${id}` }],
        [{ text: '🗑 حذف', callback_data: `pkg:del:${id}` }],
        [{ text: '⬅️ رجوع', callback_data: 'a:pkgs' }],
      ],
    },
  });
}

async function adminPendingOrders(chatId: number) {
  const { data: orders } = await sb()
    .from('orders')
    .select('*, packages(name, price_iqd)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(20);
  const list = (orders || []) as any[];
  if (list.length === 0) {
    await sendMessage(chatId, '✅ لا توجد طلبات معلقة.');
    return;
  }
  await sendMessage(chatId, `⏳ <b>طلبات معلقة (${list.length})</b>`);
  for (const o of list) {
    const body =
      `👤 ${esc(o.full_name)}\n📦 ${esc(o.packages?.name || '')}\n💰 ${fmtIQD(o.packages?.price_iqd || 0)}\n🔖 <code>${o.verification_code}</code>`;
    await sendMessage(chatId, body, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ قبول', callback_data: `appr:${o.id}` },
            { text: '❌ رفض', callback_data: `rej:${o.id}` },
          ],
        ],
      },
    });
  }
}

async function adminListUsers(chatId: number) {
  const { data: sess } = await sb()
    .from('telegram_sessions')
    .select('telegram_user_id, chat_id, updated_at')
    .order('updated_at', { ascending: false })
    .limit(30);
  const list = (sess || []) as any[];
  if (list.length === 0) {
    await sendMessage(chatId, 'لا يوجد مستخدمون بعد.');
    return;
  }
  const lines = list.map(
    (u, i) => `${i + 1}. <code>${u.telegram_user_id}</code> — ${new Date(u.updated_at).toLocaleDateString('ar-IQ')}`,
  );
  await sendMessage(chatId, `👥 <b>آخر ${list.length} مستخدم</b>\n\n${lines.join('\n')}`, {
    reply_markup: { inline_keyboard: [[{ text: '⬅️ رجوع', callback_data: 'a:home' }]] },
  });
}

async function adminStats(chatId: number) {
  const [pend, appr, rej, total, users, pkgs] = await Promise.all([
    sb().from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    sb().from('orders').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    sb().from('orders').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
    sb().from('orders').select('*', { count: 'exact', head: true }),
    sb().from('telegram_sessions').select('*', { count: 'exact', head: true }),
    sb().from('packages').select('*', { count: 'exact', head: true }),
  ]);
  const { data: appData } = await sb()
    .from('orders')
    .select('packages(price_iqd)')
    .eq('status', 'approved');
  const revenue = ((appData || []) as any[]).reduce(
    (s, o) => s + (o.packages?.price_iqd || 0),
    0,
  );
  await sendMessage(
    chatId,
    `📊 <b>الإحصائيات</b>\n\n` +
      `📦 الباقات: <b>${pkgs.count || 0}</b>\n` +
      `👥 المستخدمون: <b>${users.count || 0}</b>\n\n` +
      `📥 إجمالي الطلبات: <b>${total.count || 0}</b>\n` +
      `⏳ معلّقة: <b>${pend.count || 0}</b>\n` +
      `✅ مفعّلة: <b>${appr.count || 0}</b>\n` +
      `❌ مرفوضة: <b>${rej.count || 0}</b>\n\n` +
      `💰 إجمالي الإيرادات: <b>${fmtIQD(revenue)}</b>`,
    { reply_markup: { inline_keyboard: [[{ text: '⬅️ رجوع', callback_data: 'a:home' }]] } },
  );
}

async function adminSettingsMenu(chatId: number) {
  const sup = await getSetting('support_username', 'xnxnff');
  const ppr = await getSetting('points_per_referral', '10');
  const howto = await getSetting('how_to_use', '');
  await sendMessage(
    chatId,
    `⚙️ <b>إعدادات البوت</b>\n\n` +
      `👤 الدعم: <b>@${esc(sup)}</b>\n` +
      `🎁 نقاط لكل إحالة: <b>${esc(ppr)}</b>\n` +
      `❓ شرح الاستخدام:\n${esc(howto).slice(0, 200)}${howto.length > 200 ? '…' : ''}`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✏️ يوزر الدعم', callback_data: 'set:edit:support_username' }],
          [{ text: '✏️ نقاط الإحالة', callback_data: 'set:edit:points_per_referral' }],
          [{ text: '✏️ نص شرح الاستخدام', callback_data: 'set:edit:how_to_use' }],
          [{ text: '🎬 رفع فيديو الشرح', callback_data: 'set:howto_video' }],
          [{ text: '🗑 حذف فيديو الشرح', callback_data: 'set:howto_video_del' }],
          [{ text: '⬅️ رجوع', callback_data: 'a:home' }],
        ],
      },
    },
  );
}

async function adminPointsMenu(chatId: number) {
  const { data: top } = await sb()
    .from('user_points')
    .select('telegram_user_id, points, referral_code')
    .order('points', { ascending: false })
    .limit(10);
  const list = (top || []) as any[];
  const lines = list.length
    ? list.map((u, i) => `${i + 1}. <code>${u.telegram_user_id}</code> — ${u.points} نقطة (${u.referral_code})`).join('\n')
    : 'لا يوجد بعد.';
  await sendMessage(
    chatId,
    `🎁 <b>إدارة النقاط</b>\n\nأعلى المستخدمين:\n${lines}`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ إضافة نقاط لزبون', callback_data: 'a:pts:add' }],
          [{ text: '⬅️ رجوع', callback_data: 'a:home' }],
        ],
      },
    },
  );
}

async function adminSendBroadcast(chatId: number, userId: number) {
  const state = await getState(userId);
  if (!state.bcast_text) {
    await sendMessage(chatId, 'لا يوجد نص إعلان.');
    return;
  }
  const { data: sess } = await sb().from('telegram_sessions').select('chat_id');
  const targets = (sess || []) as any[];
  let ok = 0;
  let fail = 0;
  for (const t of targets) {
    try {
      await sendMessage(Number(t.chat_id), `📢 <b>إعلان</b>\n\n${esc(state.bcast_text)}`);
      ok++;
    } catch {
      fail++;
    }
  }
  await clearState(userId, chatId);
  await sendMessage(chatId, `✅ تم البث.\nنجح: <b>${ok}</b>\nفشل: <b>${fail}</b>`);
  return showAdminPanel(chatId);
}

async function handleAdminText(chatId: number, userId: number, text: string, state: any) {
  // Broadcast
  if (state.step === 'a_bcast_text') {
    await setState(userId, chatId, { step: 'a_bcast_confirm', bcast_text: text });
    const { count } = await sb().from('telegram_sessions').select('*', { count: 'exact', head: true });
    await sendMessage(
      chatId,
      `🔎 <b>معاينة الإعلان:</b>\n\n${esc(text)}\n\nسيُرسل إلى <b>${count || 0}</b> مستخدم.`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ إرسال', callback_data: 'a:bcast:send' },
              { text: '✖️ إلغاء', callback_data: 'a:bcast:cancel' },
            ],
          ],
        },
      },
    );
    return;
  }

  // Settings value
  if (state.step === 'a_set_value' && state.set_key) {
    await setSetting(state.set_key, text);
    await clearState(userId, chatId);
    await sendMessage(chatId, '✅ تم الحفظ.');
    return adminSettingsMenu(chatId);
  }

  // Add points - step 1: get user id
  if (state.step === 'a_pts_uid') {
    const uid = parseInt(text.replace(/\D/g, ''), 10);
    if (!uid) {
      await sendMessage(chatId, '⚠️ ID غير صحيح. أعد الإرسال:');
      return;
    }
    await setState(userId, chatId, { step: 'a_pts_amount', pts_uid: uid });
    await sendMessage(chatId, '💎 أرسل عدد النقاط (يمكن أن يكون سالباً للخصم):');
    return;
  }
  if (state.step === 'a_pts_amount') {
    const amt = parseInt(text.replace(/[^\d-]/g, ''), 10);
    if (!amt) {
      await sendMessage(chatId, '⚠️ قيمة غير صحيحة.');
      return;
    }
    const uid = state.pts_uid;
    const p = await getOrCreatePoints(uid);
    const newPts = Math.max(0, ((p as any).points || 0) + amt);
    await sb().from('user_points').update({ points: newPts }).eq('telegram_user_id', uid);
    await clearState(userId, chatId);
    await sendMessage(chatId, `✅ تم. الرصيد الجديد: <b>${newPts}</b> نقطة.`);
    return adminPointsMenu(chatId);
  }

  // New package wizard
  if (state.step === 'a_pkg_name') {
    await setState(userId, chatId, { step: 'a_pkg_desc', draft: { ...state.draft, name: text } });
    await sendMessage(chatId, '📝 أرسل <b>وصف الباقة</b> (أو اكتب - للتخطي):');
    return;
  }
  if (state.step === 'a_pkg_desc') {
    const description = text === '-' ? null : text;
    await setState(userId, chatId, { step: 'a_pkg_price', draft: { ...state.draft, description } });
    await sendMessage(chatId, '💰 أرسل <b>السعر بالدينار</b> (أرقام فقط):');
    return;
  }
  if (state.step === 'a_pkg_price') {
    const price = parseInt(text.replace(/\D/g, ''), 10);
    if (!price || price <= 0) {
      await sendMessage(chatId, '⚠️ سعر غير صحيح. أعد الإرسال:');
      return;
    }
    await setState(userId, chatId, { step: 'a_pkg_dur', draft: { ...state.draft, price_iqd: price } });
    await sendMessage(chatId, '📅 أرسل <b>مدة الاشتراك بالأيام</b>:');
    return;
  }
  if (state.step === 'a_pkg_dur') {
    const dur = parseInt(text.replace(/\D/g, ''), 10);
    if (!dur || dur <= 0) {
      await sendMessage(chatId, '⚠️ مدة غير صحيحة. أعد الإرسال:');
      return;
    }
    await setState(userId, chatId, {
      step: 'a_pkg_img',
      draft: { ...state.draft, duration_days: dur },
    });
    await sendMessage(chatId, '🖼 أرسل <b>رابط صورة الباقة</b> (أو - للتخطي):');
    return;
  }
  if (state.step === 'a_pkg_img') {
    const image_url = text === '-' ? null : text;
    const draft = { ...state.draft, image_url, is_active: true };
    const { error } = await sb().from('packages').insert(draft);
    await clearState(userId, chatId);
    if (error) {
      await sendMessage(chatId, '⚠️ فشل إنشاء الباقة: ' + error.message);
      return;
    }
    await sendMessage(chatId, `✅ تم إنشاء الباقة <b>${esc(draft.name)}</b>.`);
    return adminListPackages(chatId);
  }

  // Edit single field
  const editMatch = state.step?.match(/^a_pkg_edit_(name|desc|price|dur|img)$/);
  if (editMatch) {
    const field = editMatch[1];
    const id = state.edit_id;
    const patch: any = {};
    if (field === 'name') patch.name = text;
    else if (field === 'desc') patch.description = text === '-' ? null : text;
    else if (field === 'img') patch.image_url = text === '-' ? null : text;
    else if (field === 'price') {
      const v = parseInt(text.replace(/\D/g, ''), 10);
      if (!v) {
        await sendMessage(chatId, '⚠️ قيمة غير صحيحة.');
        return;
      }
      patch.price_iqd = v;
    } else if (field === 'dur') {
      const v = parseInt(text.replace(/\D/g, ''), 10);
      if (!v) {
        await sendMessage(chatId, '⚠️ قيمة غير صحيحة.');
        return;
      }
      patch.duration_days = v;
    }
    const { error } = await sb().from('packages').update(patch).eq('id', id);
    await clearState(userId, chatId);
    if (error) {
      await sendMessage(chatId, '⚠️ فشل التعديل: ' + error.message);
      return;
    }
    await sendMessage(chatId, '✅ تم التحديث.');
    return adminViewPackage(chatId, id);
  }

  await sendMessage(chatId, 'أمر غير معروف. /admin للعودة للوحة.');
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
            if (m.video) await handleVideo(m);
            else if (m.photo) await handlePhoto(m);
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
