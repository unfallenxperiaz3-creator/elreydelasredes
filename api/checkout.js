// Crea la página de pago de Stripe para una puja de creador o un apoyo de fan.
import {
  db, stripe, json, fail, readJson, safeEqual, cleanText, siteOrigin,
  MIN_EUR, FAN_MAX_EUR, CREATOR_MAX_EUR
} from '../lib/core.js';
import { claimNewCreator } from '../lib/claim.js';

export async function POST(request) {
  const b = await readJson(request);
  if (!b) return fail('Petición no válida.');
  const kind = b.kind;
  const amount = Number(b.amount);
  if (!['bid', 'fan'].includes(kind)) return fail('Tipo de pago no válido.');
  if (!Number.isInteger(amount)) return fail('La cantidad debe ser un número entero de euros.');
  const max = kind === 'fan' ? FAN_MAX_EUR : CREATOR_MAX_EUR;
  if (amount < MIN_EUR || amount > max) return fail(`Elige una cantidad entre ${MIN_EUR} y ${max.toLocaleString('es-ES')} €.`);
  const monthly = kind === 'fan' && !!b.monthly;

  let creator, ownerToken = null;
  if (kind === 'fan' || b.creatorId) {
    const { data } = await db().from('creators').select('id,handle,owner_token,hidden').eq('id', String(b.creatorId || '')).maybeSingle();
    if (!data || data.hidden) return fail('Ese creador no está disponible.', 404);
    if (kind === 'bid' && !safeEqual(b.ownerToken, data.owner_token)) return fail('No tienes permiso para pujar por esta cuenta desde este dispositivo.', 403);
    creator = data;
  } else {
    const r = await claimNewCreator(b.newCreator || {});
    if (r.error) return fail(r.error, r.status);
    creator = r.creator; ownerToken = r.ownerToken;
  }

  const nick = kind === 'fan' ? cleanText(b.nick, 20) : '';
  const fanToken = kind === 'fan' ? cleanText(b.fanToken, 80) : '';
  if (kind === 'fan' && fanToken.length < 16) return fail('Falta el identificador de fan. Recarga la página.');

  const name = kind === 'bid' ? `Puesto en El Rey de las Redes · @${creator.handle}`
    : monthly ? `Apoyo mensual a @${creator.handle}` : `Apoyo a @${creator.handle}`;
  const metadata = { kind, creator_id: creator.id, nick, fan_token: fanToken };
  const origin = siteOrigin(request);

  const session = await stripe().checkout.sessions.create({
    mode: monthly ? 'subscription' : 'payment',
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: amount * 100,
        product_data: { name },
        ...(monthly ? { recurring: { interval: 'month' } } : {})
      }
    }],
    metadata,
    ...(monthly ? { subscription_data: { metadata } } : { payment_intent_data: { metadata, description: name } }),
    locale: 'es',
    custom_text: { submit: { message: 'Al pagar confirmas que tienes 18 años o más y aceptas las normas de El Rey de las Redes. Los pagos no son reembolsables.' } },
    success_url: `${origin}/?pago=ok&sid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?pago=cancelado`,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 // la página de pago caduca en 1 hora
  });

  return json({ url: session.url, creatorId: creator.id, ownerToken });
}
