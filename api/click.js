// Cuenta un clic hacia el enlace de un creador.
import { db, json, readJson } from '../lib/core.js';

export async function POST(request) {
  const b = await readJson(request);
  const id = String(b?.id || '');
  if (/^[0-9a-f-]{36}$/.test(id)) await db().rpc('add_click', { cid: id });
  return json({ ok: true });
}
