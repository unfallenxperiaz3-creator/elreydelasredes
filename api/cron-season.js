// Se ejecuta cada día. Si la temporada anterior ya terminó y su rey aún no está en el
// salón de reyes, lo guarda. El ranking es acumulado: no se borra al cambiar de temporada.
import { db, json, fail, board, previousSeasonKey, safeEqual } from '../lib/core.js';

// Guarda en el salón de reyes a quien estaba en el número 1 al cerrar la temporada anterior (si aún no está).
export async function closeSeason() {
  const season = previousSeasonKey();
  const { data: done } = await db().from('hall').select('season').eq('season', season).maybeSingle();
  if (done) return { ok: true, season, already: true };
  const { ranked } = await board(season);
  const king = ranked[0];
  if (!king || king.own + king.fans <= 0) return { ok: true, season, empty: true };
  const { error } = await db().from('hall').insert({
    season, creator_id: king.id, name: king.name, handle: king.handle,
    total_cents: king.own + king.fans, fans: king.supporters.size
  });
  if (error && error.code !== '23505') throw error;
  return { ok: true, season, king: king.handle };
}

// Entrada para Vercel Cron (protegida con CRON_SECRET)
export async function GET(request) {
  const auth = request.headers.get('authorization') || '';
  if (!process.env.CRON_SECRET || !safeEqual(auth, `Bearer ${process.env.CRON_SECRET}`)) return fail('No autorizado.', 401);
  return json(await closeSeason());
}
