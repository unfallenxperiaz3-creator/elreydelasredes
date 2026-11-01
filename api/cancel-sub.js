// Un fan cancela su apoyo mensual a un creador.
import { db, stripe, json, fail, readJson, cleanText } from '../lib/core.js';

export async function POST(request) {
  const b = await readJson(request);
  const fanToken = cleanText(b?.fanToken, 80);
  if (fanToken.length < 16) return fail('Petición no válida.');
  const { data: subs } = await db().from('subscriptions').select('stripe_subscription_id')
    .eq('fan_token', fanToken).eq('creator_id', String(b.creatorId || '')).eq('status', 'active');
  if (!subs?.length) return fail('No tienes ningún apoyo mensual activo a este creador.', 404);
  for (const s of subs) {
    try { await stripe().subscriptions.cancel(s.stripe_subscription_id); } catch (e) { if (e?.code !== 'resource_missing') throw e; }
    await db().from('subscriptions').update({ status: 'canceled' }).eq('stripe_subscription_id', s.stripe_subscription_id);
  }
  return json({ ok: true });
}
