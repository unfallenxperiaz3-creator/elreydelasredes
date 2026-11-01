// Acciones del propio creador (con su llave de dueño guardada en su navegador):
// ver su código de verificación, pedir verificación, meta, foto, email de avisos y duelos.
import { db, json, fail, readJson, safeEqual, cleanText } from '../lib/core.js';
import { uploadPhoto } from '../lib/photo.js';

const DAY = 86400000;

export async function POST(request) {
  const b = await readJson(request);
  if (!b) return fail('Petición no válida.');
  const { data: c } = await db().from('creators').select('*').eq('id', String(b.creatorId || '')).maybeSingle();
  if (!c || !safeEqual(b.ownerToken, c.owner_token)) return fail('No tienes permiso para gestionar esta cuenta desde este dispositivo.', 403);
  const upd = fields => db().from('creators').update(fields).eq('id', c.id);

  switch (b.action) {
    case 'me':
      return json({ verifyCode: c.verify_code, verified: c.verified, verifyRequested: !!c.verify_requested_at, alertEmail: c.alert_email || '' });

    case 'verify': {
      if (c.verified) return json({ ok: true, verified: true });
      await upd({ verify_requested_at: new Date().toISOString() });
      return json({ ok: true });
    }

    case 'goal': {
      const text = cleanText(b.text, 60);
      const target = Number(b.target);
      if (!text) { await upd({ goal_text: null, goal_target: null }); return json({ ok: true }); }
      if (!Number.isInteger(target) || target < 10 || target > 10000) return fail('La meta debe ser de 10 a 10.000 €.');
      await upd({ goal_text: text, goal_target: target });
      return json({ ok: true });
    }

    case 'photo': {
      const url = await uploadPhoto(c.id, b.photo);
      if (!url) return fail('La foto no es válida o pesa demasiado.');
      await upd({ photo_url: url });
      return json({ ok: true, photo: url });
    }

    case 'alert': {
      const email = cleanText(b.email, 120);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Ese email no parece válido.');
      await upd({ alert_email: email || null });
      return json({ ok: true });
    }

    case 'challenge': {
      const rivalId = String(b.rivalId || '');
      if (rivalId === c.id) return fail('No puedes retarte a ti mismo.');
      const { data: rival } = await db().from('creators').select('id,hidden').eq('id', rivalId).maybeSingle();
      if (!rival || rival.hidden) return fail('Ese creador no está disponible.');
      const { data: busy } = await db().from('duels').select('id').in('status', ['pending', 'active'])
        .or(`a.eq.${c.id},b.eq.${c.id},a.eq.${rival.id},b.eq.${rival.id}`);
      if (busy?.length) return fail('Alguno de los dos ya tiene un duelo pendiente o en marcha.');
      const { error } = await db().from('duels').insert({ a: c.id, b: rival.id });
      if (error) throw error;
      return json({ ok: true });
    }

    case 'accept':
    case 'decline': {
      const { data: d } = await db().from('duels').select('*').eq('id', String(b.duelId || '')).maybeSingle();
      if (!d || d.b !== c.id || d.status !== 'pending') return fail('Ese reto ya no está disponible.');
      if (b.action === 'decline') { await db().from('duels').update({ status: 'declined' }).eq('id', d.id); return json({ ok: true }); }
      const start = new Date();
      await db().from('duels').update({ status: 'active', starts_at: start.toISOString(), ends_at: new Date(start.getTime() + DAY).toISOString() }).eq('id', d.id);
      return json({ ok: true });
    }

    default:
      return fail('Acción no válida.');
  }
}
