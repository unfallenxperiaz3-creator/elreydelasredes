// Panel de administrador. Protegido con la contraseña ADMIN_PASSWORD.
import { db, json, fail, readJson, safeEqual, newToken, seasonKey, madridDay } from '../lib/core.js';

function allowed(request) {
  return !!process.env.ADMIN_PASSWORD && safeEqual(request.headers.get('x-admin-password') || '', process.env.ADMIN_PASSWORD);
}

export async function GET(request) {
  if (!allowed(request)) return fail('Contraseña incorrecta.', 401);
  const since = madridDay(new Date(Date.now() - 13 * 86400000));
  const [creators, payments, waitlist, subs, visits] = await Promise.all([
    db().from('creators').select('id,name,handle,platform,url,photo_url,verified,verify_code,verify_requested_at,hidden,clicks,created_at').order('created_at', { ascending: false }).limit(500),
    db().from('payments').select('id,creator_id,kind,amount_cents,nick,monthly,season,created_at').order('created_at', { ascending: false }).limit(100),
    db().from('waitlist').select('email', { count: 'exact', head: true }),
    db().from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    db().from('visits_daily').select('day,source,views,uniques').gte('day', since).order('day', { ascending: false })
  ]);
  for (const r of [creators, payments]) if (r.error) return fail(r.error.message, 500);
  const season = seasonKey();
  const seasonTotal = payments.data.filter(p => p.season === season).reduce((s, p) => s + p.amount_cents, 0);
  return json({
    season, seasonTotalShown: seasonTotal / 100,
    creators: creators.data, payments: payments.data,
    waitlist: waitlist.count || 0, activeSubs: subs.count || 0,
    today: madridDay(), visits: visits.error ? null : visits.data
  });
}

export async function POST(request) {
  if (!allowed(request)) return fail('Contraseña incorrecta.', 401);
  const b = await readJson(request);
  const id = String(b?.creatorId || '');
  const upd = fields => db().from('creators').update(fields).eq('id', id);
  switch (b?.action) {
    case 'approve': await upd({ verified: true }); break;
    case 'reject': await upd({ verify_requested_at: null }); break;
    case 'unverify': await upd({ verified: false }); break;
    case 'hide': await upd({ hidden: true }); break;
    case 'unhide': await upd({ hidden: false }); break;
    case 'removePhoto': await upd({ photo_url: null }); break;
    case 'resetOwner': {
      const token = newToken();
      await upd({ owner_token: token });
      return json({ ok: true, ownerToken: token });
    }
    default: return fail('Acción no válida.');
  }
  return json({ ok: true });
}
