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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fileName } = req.query;
    if (!fileName || typeof fileName !== 'string') {
      return res.status(400).json({ error: 'Invalid fileName' });
    }
    if (fileName.endsWith('/')) {
      return res.status(400).json({ error: 'Cannot download directory' });
    }

    const { apiUrl, authorizationToken } = await getB2Auth();

    const listRes = await fetch(`${apiUrl}/b2api/v2/b2_list_file_names`, {
      method: 'POST',
      headers: { Authorization: authorizationToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucketId: BUCKET_ID, prefix: fileName, maxFileCount: 1 })
    });

    if (!listRes.ok) throw new Error('File not found in list');
    const listData = await listRes.json();
    const file = listData.files.find(f => f.fileName === fileName);
    if (!file) throw new Error('File not found');

    const downloadRes = await fetch(`${apiUrl}/b2api/v2/b2_download_file_by_id`, {
      method: 'POST',
      headers: {
        Authorization: authorizationToken,
      },
      body: JSON.stringify({ fileId: file.fileId })
    });

    if (!downloadRes.ok) {
      const text = await downloadRes.text().catch(() => 'unknown');
      throw new Error('Download failed: ' + text);
    }

    const buffer = await downloadRes.arrayBuffer();
    res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName.split('/').pop())}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: err.message });
  }
}