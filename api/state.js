// Todo lo que la web necesita para pintarse: ranking, duelos, récords, salón de reyes y actividad.
import {
  db, json, fail, board, publicCreator, seasonKey, seasonNumber, seasonEndsAt, madridDay, fetchAll, cleanText
} from '../lib/core.js';

const DAY = 86400000;

async function duelTally(d, until) {
  const { data, error } = await db().from('payments').select('creator_id,amount_cents')
    .eq('kind', 'fan').in('creator_id', [d.a, d.b])
    .gte('created_at', d.starts_at).lte('created_at', until);
  if (error) throw error;
  let ta = 0, tb = 0;
  for (const p of data) { if (p.creator_id === d.a) ta += p.amount_cents; else tb += p.amount_cents; }
  return { ta, tb };
}

export async function GET(request) {
  try {
    const fan = cleanText(new URL(request.url).searchParams.get('fan'), 80) || null;
    const season = seasonKey();
    const now = Date.now();
    const [{ creators, payments, ranked }, duelsRes, winsRes, hallRes, kings, bigRes, subsRes] = await Promise.all([
      board(season),
      db().from('duels').select('*').gte('created_at', new Date(now - 8 * DAY).toISOString()).order('created_at'),
      db().from('duels').select('winner').eq('status', 'done').not('winner', 'is', null),
      db().from('hall').select('season,creator_id,name,handle,total_cents,fans').order('season', { ascending: false }),
      fetchAll(() => db().from('king_log').select('season,creator_id,since').order('since')),
      db().from('payments').select('amount_cents,creator_id').order('amount_cents', { ascending: false }).limit(20),
      fan ? db().from('subscriptions').select('creator_id,amount_cents').eq('fan_token', fan).eq('status', 'active') : Promise.resolve({ data: [] })
    ]);
    for (const r of [duelsRes, winsRes, hallRes, bigRes, subsRes]) if (r.error) throw r.error;
    const byId = new Map(creators.map(c => [c.id, c]));
    const visible = id => byId.has(id) && !byId.get(id).hidden;

    // Duelos: cerrar los que han terminado y calcular marcadores
    const duels = [];
    for (const d of duelsRes.data) {
      if (d.status === 'declined') continue;
      if (d.status === 'pending') { duels.push({ id: d.id, a: d.a, b: d.b, status: 'pending', ta: 0, tb: 0 }); continue; }
      const ended = new Date(d.ends_at).getTime() <= now;
      const { ta, tb } = await duelTally(d, ended ? d.ends_at : new Date(now).toISOString());
      let status = d.status, winner = d.winner;
      if (d.status === 'active' && ended) {
        winner = ta >= tb ? d.a : d.b;
        status = 'done';
        await db().from('duels').update({ status, winner }).eq('id', d.id);
        winsRes.data.push({ winner });
      }
      if (status === 'done' && now - new Date(d.ends_at).getTime() > DAY) continue;
      duels.push({ id: d.id, a: d.a, b: d.b, status, startsAt: d.starts_at, endsAt: d.ends_at, ta: ta / 100, tb: tb / 100, winner });
    }
    const duelWins = {};
    for (const w of winsRes.data) duelWins[w.winner] = (duelWins[w.winner] || 0) + 1;

    // Reinados: el más largo de todas las temporadas y desde cuándo reina el actual
    let longest = null, kingSince = null;
    for (let i = 0; i < kings.length; i++) {
      const k = kings[i], next = kings[i + 1];
      const end = next && next.season === k.season ? new Date(next.since).getTime()
        : k.season === season ? now : new Date(seasonEndsAt(new Date(k.since))).getTime();
      const ms = end - new Date(k.since).getTime();
      if (visible(k.creator_id) && (!longest || ms > longest.ms)) longest = { creatorId: k.creator_id, ms };
      if (k.season === season && !next) kingSince = k.since;
    }
    const lastKing = [...kings].reverse().find(k => k.season === season);
    if (!ranked[0] || !lastKing || lastKing.creator_id !== ranked[0].id) kingSince = ranked[0]?.firstPaid || null;

    const today = madridDay();
    const todayCents = payments.filter(p => visible(p.creator_id) && madridDay(new Date(p.created_at)) === today).reduce((s, p) => s + p.amount_cents, 0);
    const big = bigRes.data.find(p => visible(p.creator_id));

    const feed = payments.slice(-8).reverse().map(p => {
      const c = byId.get(p.creator_id);
      return c && !c.hidden ? { at: p.created_at, kind: p.kind, nick: p.kind === 'fan' ? (p.nick || 'Un fan') : null, handle: c.handle, amount: p.amount_cents / 100, monthly: p.monthly } : null;
    }).filter(Boolean);

    return json({
      season: { key: season, n: seasonNumber(season), endsAt: seasonEndsAt() },
      creators: ranked.map(c => publicCreator(c, fan)),
      duels, duelWins,
      hall: hallRes.data.map(h => ({ season: h.season, n: seasonNumber(h.season), creatorId: h.creator_id, name: h.name, handle: h.handle, total: h.total_cents / 100, fans: h.fans })),
      feed,
      stats: {
        today: todayCents / 100,
        clicks: creators.reduce((s, c) => s + (c.hidden ? 0 : c.clicks), 0),
        kingSince,
        longest: longest && byId.get(longest.creatorId) ? { handle: byId.get(longest.creatorId).handle, ms: longest.ms, live: !!ranked[0] && longest.creatorId === ranked[0].id && kingSince && now - new Date(kingSince).getTime() >= longest.ms - 1000 } : null,
        biggest: big && byId.get(big.creator_id) ? { handle: byId.get(big.creator_id).handle, amount: big.amount_cents / 100 } : null
      },
      subs: (subsRes.data || []).map(s => ({ creatorId: s.creator_id, amount: s.amount_cents / 100 })),
      legal: { name: process.env.LEGAL_NAME || '', nif: process.env.LEGAL_NIF || '', email: process.env.LEGAL_EMAIL || '' }
    });
  } catch (e) {
    console.error(e);
    return fail('No se pudo cargar el ranking. Inténtalo de nuevo en unos segundos.', 500);
  }
}
