import { Buffer } from 'buffer';

const B2_KEY_ID = process.env.B2_KEY_ID || '0033bed499501450000000002';
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY || 'K0032ZG3IYROgkaVsMVwSdNTSANgX4E';
const BUCKET_ID = process.env.BUCKET_ID || '233b1e5d04b9492590b10415';

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
    const { folderKey } = req.body;
    if (!folderKey || !folderKey.endsWith('/')) {
      return res.status(400).json({ error: 'Invalid folderKey' });
    }

    const { apiUrl, authorizationToken } = await getB2Auth();

    const uploadUrlRes = await fetch(`${apiUrl}/b2api/v2/b2_get_upload_url`, {
      method: 'POST',
      headers: {
        Authorization: authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ bucketId: BUCKET_ID })
    });

    if (!uploadUrlRes.ok) {
      const errText = await uploadUrlRes.text();
      throw new Error('Get upload URL failed: ' + errText);
    }

    const uploadData = await uploadUrlRes.json();
    const keepKey = folderKey + '.keep';
    const encodedKeepKey = encodeURIComponent(keepKey);

    const uploadRes = await fetch(uploadData.uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: uploadData.authorizationToken,
        'X-Bz-File-Name': encodedKeepKey,
        'Content-Type': 'text/plain',
        'X-Bz-Content-Sha1': 'da39a3ee5e6b4b0d3255bfef95601890afd80709'
      },
      body: ''
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error('Failed to create .keep: ' + err);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Create folder error:', err);
    res.status(500).json({ error: err.message });
  }
}