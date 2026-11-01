// Netlify: reutiliza el mismo código que /api/webhook.js
import * as handler from '../../api/webhook.js';

export default async (request) => {
  const fn = handler[request.method];
  return fn ? fn(request) : new Response('Método no permitido', { status: 405 });
};
