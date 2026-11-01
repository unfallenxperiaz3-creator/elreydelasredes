// Se ejecuta cada día (Vercel Cron). Si la temporada anterior ya terminó y su rey
// aún no está en el salón de reyes, lo guarda. El ranking nuevo empieza solo,
// porque cada pago se apunta en la semana en que se hizo.
import { db, json, fail, board, previousSeasonKey, safeEqual } from '../lib/core.js';

export async function GET(request) {
  const auth = request.headers.get('authorization') || '';
  if (!process.env.CRON_SECRET || !safeEqual(auth, `Bearer ${process.env.CRON_SECRET}`)) return fail('No autorizado.', 401);
  const season = previousSeasonKey();
  const { data: done } = await db().from('hall').select('season').eq('season', season).maybeSingle();
  if (done) return json({ ok: true, season, already: true });
  const { ranked } = await board(season);
  const king = ranked[0];
  if (!king) return json({ ok: true, season, empty: true });
  const { error } = await db().from('hall').insert({
    season, creator_id: king.id, name: king.name, handle: king.handle,
    total_cents: king.own + king.fans, fans: king.supporters.size
  });
  if (error && error.code !== '23505') throw error;
  return json({ ok: true, season, king: king.handle });
}
