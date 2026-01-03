import { Buffer } from 'buffer';

const B2_KEY_ID = process.env.B2_KEY_ID || '0033bed499501450000000002';
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY || 'K0032ZG3IYROgkaVsMVwSdNTSANgX4E';
const BUCKET_ID = process.env.BUCKET_ID || '233b1e5d04b9492590b10415';
const RESTRICTED_ROOT = process.env.RESTRICTED_ROOT || 'public/templates/';

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { apiUrl, authorizationToken } = await getB2Auth();
    const response = await fetch(`${apiUrl}/b2api/v2/b2_list_file_names`, {
      method: 'POST',
      headers: { Authorization: authorizationToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucketId: BUCKET_ID, prefix: RESTRICTED_ROOT })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error('B2 list failed: ' + text);
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    console.error('List error:', err);
    res.status(500).json({ error: 'Proxy failed', message: err.message });
  }
}