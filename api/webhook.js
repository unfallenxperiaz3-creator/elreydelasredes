// Stripe avisa aquí de cada pago. Solo los pagos confirmados entran en el ranking.
import { db, stripe, json, fail, recordPayment } from '../lib/core.js';

export async function POST(request) {
  const signature = request.headers.get('stripe-signature');
  const body = await request.text();
  let event;
  try {
    event = await stripe().webhooks.constructEventAsync(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return fail('Firma de Stripe no válida.', 400);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const s = event.data.object;
        const m = s.metadata || {};
        if (s.mode === 'payment' && s.payment_status === 'paid') {
          await recordPayment({ ref: s.id, creatorId: m.creator_id, kind: m.kind, amountCents: s.amount_total, nick: m.nick, fanToken: m.fan_token, monthly: false });
        }
        if (s.mode === 'subscription' && s.subscription && m.creator_id) {
          await db().from('subscriptions').upsert({
            stripe_subscription_id: typeof s.subscription === 'string' ? s.subscription : s.subscription.id,
            creator_id: m.creator_id, fan_token: m.fan_token, nick: m.nick || null, amount_cents: s.amount_total, status: 'active'
          }, { onConflict: 'stripe_subscription_id' });
        }
        break;
      }
      case 'invoice.paid': {
        const inv = event.data.object;
        const sub = inv.subscription || inv.parent?.subscription_details?.subscription;
        const subId = typeof sub === 'string' ? sub : sub?.id;
        if (!subId || !(inv.amount_paid > 0)) break;
        let m = inv.parent?.subscription_details?.metadata || inv.subscription_details?.metadata;
        if (!m?.creator_id) m = (await stripe().subscriptions.retrieve(subId)).metadata;
        if (!m?.creator_id) break;
        await recordPayment({ ref: inv.id, creatorId: m.creator_id, kind: 'fan', amountCents: inv.amount_paid, nick: m.nick, fanToken: m.fan_token, monthly: true });
        break;
      }
      case 'customer.subscription.deleted': {
        await db().from('subscriptions').update({ status: 'canceled' }).eq('stripe_subscription_id', event.data.object.id);
        break;
      }
    }
  } catch (e) {
    console.error('Error en webhook', event.type, e);
    return fail('Error procesando el evento.', 500); // Stripe lo reintentará
  }
  return json({ received: true });
}
