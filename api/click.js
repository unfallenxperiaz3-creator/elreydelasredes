// Cuenta un clic hacia el enlace de un creador: como máximo 1 por persona, creador y temporada.
import { db, json, readJson, cleanText, seasonKey } from '../lib/core.js';

export async function POST(request) {
  const b = await readJson(request);
  const id = String(b?.id || '');
  const visitor = cleanText(b?.v, 80);
  if (!/^[0-9a-f-]{36}$/.test(id)) return json({ ok: true });
  if (visitor.length >= 16) {
    const { error } = await db().rpc('add_unique_click', { cid: id, v: visitor, s: seasonKey() });
    if (!error) return json({ ok: true });
    console.error('clic único', error.message);
  }
  return json({ ok: true });
}
