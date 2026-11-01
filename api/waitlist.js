// Lista de espera para la semana de fundadores.
import { db, json, fail, readJson, cleanText } from '../lib/core.js';

export async function POST(request) {
  const b = await readJson(request);
  const email = cleanText(b?.email, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Escribe un email válido, por ejemplo nombre@gmail.com');
  const { error } = await db().from('waitlist').upsert({ email }, { onConflict: 'email', ignoreDuplicates: true });
  if (error) throw error;
  return json({ ok: true });
}
