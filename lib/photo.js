// Sube la foto de perfil (ya recortada en el navegador) a Supabase Storage.
import { db } from './core.js';

const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

export async function uploadPhoto(creatorId, dataUrl) {
  const m = typeof dataUrl === 'string' && dataUrl.match(PHOTO_RE);
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 300 * 1024) return null;
  const path = `${creatorId}-${Date.now()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  const { error } = await db().storage.from('photos').upload(path, buf, { contentType: `image/${m[1]}`, upsert: true });
  if (error) throw error;
  return db().storage.from('photos').getPublicUrl(path).data.publicUrl;
}
