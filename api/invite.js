// Invitaciones gratis: comprobar un enlace (GET) y apuntarse con él (POST).
import { db, json, fail, readJson, cleanText, seasonKey } from '../lib/core.js';
import { claimNewCreator } from '../lib/claim.js';
import { notify, tg, NET_NAMES } from '../lib/notify.js';

const CODE_RE = /^[A-Za-z0-9]{6,20}$/;

async function check(code) {
  if (!CODE_RE.test(code)) return null;
  const { data } = await db().from('invites').select('code,max_uses,uses,expires_at').eq('code', code).maybeSingle();
  if (!data) return null;
  const left = data.max_uses - data.uses;
  const expired = data.expires_at && new Date(data.expires_at).getTime() <= Date.now();
  return { left: Math.max(0, left), valid: left > 0 && !expired };
}

export async function GET(request) {
  const code = cleanText(new URL(request.url).searchParams.get('code'), 20);
  const r = await check(code);
  return json(r && r.valid ? { valid: true, left: r.left } : { valid: false });
}

export async function POST(request) {
  const b = await readJson(request);
  const code = cleanText(b?.code, 20);
  if (!b?.adult) return fail('Tienes que confirmar que tienes 18 años o más.');
  const r = await check(code);
  if (!r || !r.valid) return fail('Esta invitación ya no es válida: se han usado todas sus plazas o ha caducado.', 410);
  const now = new Date().toISOString();
  const res = await claimNewCreator(b.newCreator || {}, { invited_at: now, invited_season: seasonKey(), invite_code: code });
  if (res.error) return fail(res.error, res.status);
  const { data: ok, error } = await db().rpc('use_invite', { c: code });
  if (error || !ok) {
    // Otra persona gastó la última plaza a la vez: deshacer el alta
    await db().from('creators').delete().eq('id', res.creator.id);
    return fail('Esta invitación acaba de agotarse. Pide otra a quien te la envió.', 410);
  }
  const n = b.newCreator || {};
  await notify(['👑 ' + tg.b('Nuevo creador con invitación'), `@${tg.esc(res.creator.handle)} · ${tg.esc(NET_NAMES[n.platform] || n.platform)}`, n.url ? tg.esc(n.url) : '']);
  return json({ creatorId: res.creator.id, ownerToken: res.ownerToken });
}
