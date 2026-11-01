// Netlify: tarea programada diaria que cierra la temporada anterior.
import { closeSeason } from '../../api/cron-season.js';

export default async () => {
  const result = await closeSeason();
  console.log('Cierre de temporada', result);
  return new Response('ok');
};

export const config = { schedule: '10 0 * * *' };
