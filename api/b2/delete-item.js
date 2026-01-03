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

async function deleteB2Item(apiUrl, authorizationToken, fileName, isDir) {
  if (isDir) {
    let startFileName = null;
    do {
      const listRes = await fetch(`${apiUrl}/b2api/v2/b2_list_file_names`, {
        method: 'POST',
        headers: { Authorization: authorizationToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucketId: BUCKET_ID, prefix: fileName, startFileName })
      });

      if (!listRes.ok) continue;

      const data = await listRes.json();
      for (const file of data.files) {
        await fetch(`${apiUrl}/b2api/v2/b2_delete_file_version`, {
          method: 'POST',
          headers: { Authorization: authorizationToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.fileName, fileId: file.fileId })
        });
      }
      startFileName = data.nextFileName;
    } while (startFileName);
  } else {
    const listRes = await fetch(`${apiUrl}/b2api/v2/b2_list_file_names`, {
      method: 'POST',
      headers: { Authorization: authorizationToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucketId: BUCKET_ID, prefix: fileName, maxFileCount: 1 })
    });

    if (!listRes.ok) throw new Error('File not found');
    const data = await listRes.json();
    const file = data.files[0];
    if (!file) throw new Error('File not found');

    await fetch(`${apiUrl}/b2api/v2/b2_delete_file_version`, {
      method: 'POST',
      headers: { Authorization: authorizationToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.fileName, fileId: file.fileId })
    });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fileName, isDir } = req.body;
    if (!fileName) {
      return res.status(400).json({ error: 'Missing fileName' });
    }

    const { apiUrl, authorizationToken } = await getB2Auth();
    await deleteB2Item(apiUrl, authorizationToken, fileName, isDir);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Internal error', message: err.message });
  }
}