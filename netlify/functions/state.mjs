// Netlify: reutiliza el mismo código que /api/state.js
import * as handler from '../../api/state.js';

export default async (request) => {
  const fn = handler[request.method];
  return fn ? fn(request) : new Response('Método no permitido', { status: 405 });
};
