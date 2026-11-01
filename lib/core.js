// Lógica compartida del servidor: conexión a Supabase y Stripe, temporadas y ranking.
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual, randomBytes } from 'node:crypto';

export const MIN_EUR = 3;
export const FAN_MAX_EUR = 20;
export const CREATOR_MAX_EUR = 10000;
export const CATS = [
  'humor', 'musica', 'gaming', 'deportes', 'belleza', 'lifestyle', 'viajes', 'comida', 'salud', 'educacion',
  'tecnologia', 'negocios', 'motor', 'mascotas', 'familia', 'arte', 'entretenimiento', 'hogar', 'noticias',
  'espiritualidad', 'otro'
];
export const HANDLE_RE = /^[A-Za-z0-9._]{2,30}$/;
const DAY = 86400000;

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

let _db, _stripe;
export function db() {
  if (!_db) _db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  return _db;
}
export function stripe() {
  if (!_stripe) _stripe = new Stripe(env('STRIPE_SECRET_KEY'));
  return _stripe;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}
export const fail = (message, status = 400) => json({ error: message }, status);

export async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

export function newToken() { return randomBytes(24).toString('hex'); }

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function cleanText(v, max) {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : '';
}

export function siteOrigin(request) {
  return process.env.SITE_URL ? process.env.SITE_URL.replace(/\/$/, '') : new URL(request.url).origin;
}

// ---------- Temporadas (semanas ISO en hora de Madrid) ----------
function madridParts(date) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const g = t => +p.find(x => x.type === t).value;
  return { y: g('year'), m: g('month'), d: g('day') };
}
export function madridDay(date = new Date()) {
  const { y, m, d } = madridParts(date);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export function seasonKey(date = new Date()) {
  const { y, m, d } = madridParts(date);
  const t = new Date(Date.UTC(y, m - 1, d));
  const wd = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - wd);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((t - y0) / DAY + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(w).padStart(2, '0')}`;
}
export const previousSeasonKey = (date = new Date()) => seasonKey(new Date(date.getTime() - 7 * DAY));
export const seasonNumber = key => +key.split('-W')[1];

function madridOffsetMs(date) {
  const asMadrid = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  const asUtc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  return asMadrid - asUtc;
}
export function seasonEndsAt(date = new Date()) {
  const { y, m, d } = madridParts(date);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const add = ((8 - wd) % 7) || 7;
  const guess = new Date(Date.UTC(y, m - 1, d + add, 0, 0, 0));
  return new Date(guess.getTime() - madridOffsetMs(guess)).toISOString();
}

// ---------- Lectura de datos ----------
export async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
export const allCreators = () => fetchAll(() => db().from('creators').select('*').order('created_at'));
export const seasonPayments = season => fetchAll(() =>
  db().from('payments').select('id,creator_id,kind,amount_cents,nick,fan_token,monthly,created_at').eq('season', season).order('created_at'));

// Ranking de una temporada: suma pujas del creador y apoyos de fans.
export function computeBoard(creators, payments) {
  const map = new Map(creators.map(c => [c.id, { ...c, own: 0, fans: 0, supporters: new Set(), fanTotals: new Map(), firstPaid: null }]));
  for (const p of payments) {
    const c = map.get(p.creator_id);
    if (!c) continue;
    if (p.kind === 'bid') c.own += p.amount_cents;
    else {
      c.fans += p.amount_cents;
      const key = p.fan_token || 'anon:' + p.id;
      c.supporters.add(key);
      const f = c.fanTotals.get(key) || { nick: p.nick || 'Anónimo', amount: 0, token: p.fan_token || null };
      f.amount += p.amount_cents;
      if (p.nick) f.nick = p.nick;
      c.fanTotals.set(key, f);
    }
    if (!c.firstPaid || p.created_at < c.firstPaid) c.firstPaid = p.created_at;
  }
  return [...map.values()]
    .filter(c => !c.hidden && c.own + c.fans > 0)
    .sort((a, b) => (b.own + b.fans) - (a.own + a.fans) || (a.firstPaid < b.firstPaid ? -1 : a.firstPaid > b.firstPaid ? 1 : 0));
}

// Lo que se publica de cada creador (nunca tokens ni emails).
export function publicCreator(c, fanToken) {
  const top = [...c.fanTotals.values()].sort((a, b) => b.amount - a.amount);
  const meIdx = fanToken ? top.findIndex(f => f.token === fanToken) : -1;
  return {
    id: c.id, name: c.name, handle: c.handle, platform: c.platform, cat: c.cat, url: c.url,
    photo: c.photo_url || '', verified: c.verified, verifyRequested: !!c.verify_requested_at && !c.verified,
    goal: c.goal_text && c.goal_target ? { text: c.goal_text, target: c.goal_target } : null,
    own: c.own / 100, fans: c.fans / 100, supporters: c.supporters.size, clicks: c.clicks,
    topFans: top.slice(0, 5).map(f => ({ nick: f.nick, amount: f.amount / 100, me: !!fanToken && f.token === fanToken })),
    me: meIdx >= 0 ? { pos: meIdx + 1, amount: top[meIdx].amount / 100 } : null,
    since: c.firstPaid
  };
}

export async function board(season) {
  const [creators, payments] = await Promise.all([allCreators(), seasonPayments(season)]);
  return { creators, payments, ranked: computeBoard(creators, payments) };
}

// ---------- Registro de pagos (desde el webhook de Stripe) ----------
export async function recordPayment({ ref, creatorId, kind, amountCents, nick, fanToken, monthly }) {
  if (!creatorId || !['bid', 'fan'].includes(kind) || !(amountCents > 0)) return { skipped: true };
  const season = seasonKey();
  const before = await board(season);
  const row = { stripe_ref: ref, creator_id: creatorId, kind, amount_cents: amountCents, nick: nick || null, fan_token: fanToken || null, monthly: !!monthly, season };
  const { data, error } = await db().from('payments').insert(row).select('id,created_at').single();
  if (error) {
    if (error.code === '23505') return { duplicate: true };
    if (error.code === '23503') return { skipped: true, reason: 'creador borrado' }; // la cuenta ya no existe
    throw error;
  }
  const after = computeBoard(before.creators, [...before.payments, { ...row, ...data }]);
  const king = after[0];
  if (king) {
    const { data: last } = await db().from('king_log').select('creator_id').eq('season', season).order('since', { ascending: false }).limit(1);
    if (!last?.length || last[0].creator_id !== king.id) await db().from('king_log').insert({ season, creator_id: king.id });
  }
  await sendDropAlerts(before.ranked, after).catch(e => console.error('Aviso por email fallido', e));
  return { ok: true };
}

// Email a los creadores que han bajado de puesto (solo si hay RESEND_API_KEY y MAIL_FROM).
async function sendDropAlerts(beforeRanked, afterRanked) {
  const key = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM;
  if (!key || !from) return;
  const prev = new Map(beforeRanked.map((c, i) => [c.id, i + 1]));
  const site = process.env.SITE_URL || '';
  const jobs = afterRanked.map((c, i) => ({ c, now: i + 1, was: prev.get(c.id) }))
    .filter(x => x.c.alert_email && x.was && x.now > x.was)
    .map(({ c, now }) => fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from, to: c.alert_email,
        subject: `Te han superado: ahora vas #${now}`,
        text: `Hola ${c.name}:\n\nAlguien te ha adelantado en El Rey de las Redes y @${c.handle} ha bajado al puesto #${now}.\n\nRecupera tu puesto o pide a tus seguidores que te apoyen con tu enlace: ${site}/@${c.handle}\n\nEl Rey de las Redes`
      })
    }));
  await Promise.all(jobs);
}
