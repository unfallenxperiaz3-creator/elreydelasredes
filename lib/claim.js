// Alta de un creador nuevo (validación, usuario libre y foto). Lo usan el pago y las invitaciones.
import { db, newToken, cleanText, CATS, HANDLE_RE, PLATFORMS } from './core.js';
import { uploadPhoto } from './photo.js';

export async function claimNewCreator(n = {}, extra = {}) {
  const handle = cleanText(n.handle, 31).replace(/^@/, '');
  const platform = PLATFORMS.includes(n.platform) ? n.platform : null;
  const name = cleanText(n.name, 28) || handle;
  const cat = CATS.includes(n.cat) ? n.cat : null;
  const url = cleanText(n.url, 300);
  const alertEmail = cleanText(n.alertEmail, 120);
  if (!HANDLE_RE.test(handle)) return { error: 'Escribe tu usuario: letras, números, puntos, guiones o guiones bajos.', status: 400 };
  if (!platform) return { error: 'Elige tu red social.', status: 400 };
  if (!cat) return { error: 'Elige tu nicho.', status: 400 };
  let u = null; try { u = new URL(url); } catch {}
  if (!u || u.protocol !== 'https:') return { error: 'El enlace debe empezar por https://', status: 400 };
  if (alertEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alertEmail)) return { error: 'Ese email no parece válido.', status: 400 };

  const { data: exists } = await db().from('creators').select('id,created_at,hidden,invited_at').eq('platform', platform).ilike('handle', handle.replace(/[_%]/g, '\\$&')).maybeSingle();
  let created, ownerToken;
  if (exists) {
    // Una cuenta registrada que nunca llegó a pagar no bloquea el usuario para siempre:
    // pasada 1 hora (lo que dura una página de pago) se puede volver a reclamar.
    const { count } = await db().from('payments').select('id', { count: 'exact', head: true }).eq('creator_id', exists.id);
    const age = Date.now() - new Date(exists.created_at).getTime();
    if (count > 0 || exists.hidden || exists.invited_at) return { error: 'Esta cuenta ya está en el ranking. Si es tuya y la registraste en otro dispositivo, escríbenos para recuperar el acceso.', status: 409 };
    if (age < 65 * 60 * 1000) return { error: 'Alguien está registrando esta cuenta ahora mismo. Si eres tú desde otro dispositivo, termina el pago allí o vuelve a intentarlo dentro de una hora.', status: 409 };
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
      if (error.code === '23505') return { error: 'Esta cuenta ya está en el ranking.', status: 409 };
      throw error;
    }
    created = data;
  }
  const creator = created;
  if (n.photo) {
    try {
      const photoUrl = await uploadPhoto(creator.id, n.photo);
      if (photoUrl) await db().from('creators').update({ photo_url: photoUrl }).eq('id', creator.id);
    } catch (e) { console.error('Foto no subida', e); }
  }
  if (Object.keys(extra).length) await db().from('creators').update(extra).eq('id', creator.id);
  return { creator, ownerToken };
}
