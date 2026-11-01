// Comprueba el estado de un pago al volver de Stripe.
import { stripe, json, fail } from '../lib/core.js';

export async function GET(request) {
  const sid = new URL(request.url).searchParams.get('sid') || '';
  if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return fail('Sesión no válida.');
  try {
    const s = await stripe().checkout.sessions.retrieve(sid);
    return json({
      paid: s.payment_status === 'paid' || (s.mode === 'subscription' && s.status === 'complete'),
      kind: s.metadata?.kind || null,
      creatorId: s.metadata?.creator_id || null,
      amount: (s.amount_total || 0) / 100,
      monthly: s.mode === 'subscription'
    });
  } catch {
    return fail('No se encontró el pago.', 404);
  }
}
