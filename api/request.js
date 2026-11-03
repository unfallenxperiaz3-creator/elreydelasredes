// Solicitudes de entrada gratis: el creador rellena el formulario y queda pendiente
// (no sale en el ranking) hasta que el administrador la acepta desde el panel.
import { json, fail, readJson } from '../lib/core.js';
import { claimNewCreator } from '../lib/claim.js';
import { notify, tg, NET_NAMES } from '../lib/notify.js';

export const MIN_FOLLOWERS = 5000;

export async function POST(request) {
  const b = await readJson(request);
  if (!b?.adult) return fail('Tienes que confirmar que tienes 18 años o más.');
  const followers = Number.parseInt(String(b.followers || '').replace(/\D/g, ''), 10) || 0;
  if (followers < MIN_FOLLOWERS) return fail(`La entrada gratis es para creadores con ${MIN_FOLLOWERS.toLocaleString('es-ES')} seguidores o más. Si tienes menos, puedes conseguir tu puesto desde 1 €.`);
  const res = await claimNewCreator(b.newCreator || {}, { requested_at: new Date().toISOString(), request_followers: Math.min(followers, 2000000000) });
  if (res.error) return fail(res.error, res.status);
  const n = b.newCreator || {};
  await notify(['🎟️ ' + tg.b('Nueva solicitud de entrada gratis'),
    `@${tg.esc(res.creator.handle)} · ${tg.esc(NET_NAMES[n.platform] || n.platform)}`,
    `${followers.toLocaleString('es-ES')} seguidores (según el creador)`,
    n.url ? tg.esc(n.url) : '', '', `Revísala en ${tg.esc(tg.admin())}`]);
  return json({ creatorId: res.creator.id, ownerToken: res.ownerToken });
}
