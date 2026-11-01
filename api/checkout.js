// Crea la página de pago de Stripe para una puja de creador o un apoyo de fan.
import {
  db, stripe, json, fail, readJson, newToken, safeEqual, cleanText, siteOrigin,
  MIN_EUR, FAN_MAX_EUR, CREATOR_MAX_EUR, CATS, HANDLE_RE
} from '../lib/core.js';
import { uploadPhoto } from '../lib/photo.js';

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
    const n = b.newCreator || {};
    const handle = cleanText(n.handle, 31).replace(/^@/, '');
    const platform = n.platform === 'instagram' ? 'instagram' : n.platform === 'tiktok' ? 'tiktok' : null;
    const name = cleanText(n.name, 28) || handle;
    const cat = CATS.includes(n.cat) ? n.cat : null;
    const url = cleanText(n.url, 300);
    const alertEmail = cleanText(n.alertEmail, 120);
    if (!HANDLE_RE.test(handle)) return fail('Escribe tu usuario: letras, números, puntos o guiones bajos.');
    if (!platform) return fail('Elige TikTok o Instagram.');
    if (!cat) return fail('Elige tu nicho.');
    let u = null; try { u = new URL(url); } catch {}
    if (!u || u.protocol !== 'https:') return fail('El enlace debe empezar por https://');
    if (alertEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alertEmail)) return fail('Ese email no parece válido.');

    const { data: exists } = await db().from('creators').select('id,created_at,hidden').eq('platform', platform).ilike('handle', handle.replace(/[_%]/g, '\\$&')).maybeSingle();
    let created;
    if (exists) {
      // Una cuenta registrada que nunca llegó a pagar no bloquea el usuario para siempre:
      // pasada 1 hora (lo que dura una página de pago) se puede volver a reclamar.
      const { count } = await db().from('payments').select('id', { count: 'exact', head: true }).eq('creator_id', exists.id);
      const age = Date.now() - new Date(exists.created_at).getTime();
      if (count > 0 || exists.hidden) return fail('Esta cuenta ya está en el ranking. Si es tuya y la registraste en otro dispositivo, escríbenos para recuperar el acceso.', 409);
      if (age < 65 * 60 * 1000) return fail('Alguien está registrando esta cuenta ahora mismo. Si eres tú desde otro dispositivo, termina el pago allí o vuelve a intentarlo dentro de una hora.', 409);
      ownerToken = newToken();
      const { error } = await db().from('creators').update({
        handle, name, cat, url, alert_email: alertEmail || null, owner_token: ownerToken, photo_url: null,
        verified: false, verify_requested_at: null, verify_code: 'REY-' + Math.floor(1000 + Math.random() * 9000),
        goal_text: null, goal_target: null, created_at: new Date().toISOString()
      }).eq('id', exists.id);
      if (error) throw error;
      created = { id: exists.id, handle };
    } else {
      ownerToken = newToken();
      const { data, error } = await db().from('creators').insert({
        handle, platform, name, cat, url, alert_email: alertEmail || null, owner_token: ownerToken,
        verify_code: 'REY-' + Math.floor(1000 + Math.random() * 9000)
      }).select('id,handle').single();
      if (error) {
        if (error.code === '23505') return fail('Esta cuenta ya está en el ranking.', 409);
        throw error;
      }
      created = data;
    }
    creator = created;
    if (n.photo) {
      try {
        const photoUrl = await uploadPhoto(creator.id, n.photo);
        if (photoUrl) await db().from('creators').update({ photo_url: photoUrl }).eq('id', creator.id);
      } catch (e) { console.error('Foto no subida', e); }
    }
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
