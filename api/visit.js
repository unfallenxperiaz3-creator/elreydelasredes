// Cuenta una visita a la web. No guarda IP, ni cookies, ni datos personales:
// solo el día, de dónde viene (TikTok, Instagram…) y si es la primera visita del día de ese navegador.
import { db, json, readJson, madridDay } from '../lib/core.js';

const KNOWN = ['tiktok', 'instagram', 'youtube', 'twitch', 'kick', 'google', 'directo', 'otros'];

export async function POST(request) {
  const b = await readJson(request);
  let src = String(b?.src || 'otros').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20) || 'otros';
  if (!KNOWN.includes(src) && !/^[a-z0-9_-]{2,20}$/.test(src)) src = 'otros';
  try { await db().rpc('add_visit', { d: madridDay(), s: src, u: !!b?.unique }); } catch (e) { console.error('visita', e); }
  return json({ ok: true });
}
