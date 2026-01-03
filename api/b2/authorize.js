import { Buffer } from 'buffer';

const B2_KEY_ID = process.env.B2_KEY_ID || '0033bed499501450000000002';
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY || 'K0032ZG3IYROgkaVsMVwSdNTSANgX4E';

// B2 Auth function
const B2_API_URL = 'https://api.backblazeb2.com/b2api/v2/b2_authorize_account';

async function getB2Auth() {
  const authHeader = 'Basic ' + Buffer.from(`${B2_KEY_ID}:${B2_APPLICATION_KEY}`).toString('base64');
  const response = await fetch(B2_API_URL, {
    headers: { Authorization: authHeader }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`B2 auth failed: ${text}`);
  }
  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = await getB2Auth();
    res.json(data);
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Internal error', message: err.message });
  }
}