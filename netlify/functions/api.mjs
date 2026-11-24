import { api } from '../../server/app.js';
import { useBlobs } from '../../server/files.js';

export default async (req, context) => {
  await useBlobs(context.deploy?.context === 'production');
  return api(req, { ip: context.ip, secure: new URL(req.url).protocol === 'https:', serverless: true });
};

export const config = { path: '/api/*' };
