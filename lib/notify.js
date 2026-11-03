// Avisos al móvil del administrador por Telegram.
// Necesita TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en las variables de entorno; si faltan, no hace nada.
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const NET_NAMES = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', twitch: 'Twitch', kick: 'Kick' };

export async function notify(lines) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return { ok: false, error: 'Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en Netlify.' };
  const text = (Array.isArray(lines) ? lines : [lines]).filter(Boolean).join('\n');
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000)
    });
    const d = await r.json().catch(() => ({}));
    if (!d.ok) { console.error('Telegram', d); return { ok: false, error: d.description || 'Telegram no aceptó el mensaje.' }; }
    return { ok: true };
  } catch (e) {
    console.error('Telegram', e);
    return { ok: false, error: 'No se pudo conectar con Telegram.' };
  }
}

export const tg = { esc, b: s => `<b>${esc(s)}</b>`, admin: () => (process.env.SITE_URL || '').replace(/\/$/, '') + '/admin' };
