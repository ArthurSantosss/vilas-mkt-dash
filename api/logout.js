import { clearAuthCookie } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  clearAuthCookie(res);
  return res.status(200).json({ success: true });
}
