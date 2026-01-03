import { Buffer } from 'buffer';
import formidable from 'formidable';
import { Readable } from 'stream';
import crypto from 'crypto';
import fs from 'fs/promises';

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

export const config = {
  api: {
    bodyParser: false, // Disabling body parsing since we're using formidable
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { key } = req.query;
    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "key" query param' });
    }

    // Parse form data using formidable
    const form = formidable({ 
      multiples: false,
      maxFileSize: 20 * 1024 * 1024, // 20MB limit
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          reject(err);
        } else {
          resolve([fields, files]);
        }
      });
    });

    const file = files.file?.[0] || files.file; // Handle both array and single file
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Read file buffer
    const fileBuffer = await readFile(file.filepath);
    
    const { apiUrl, authorizationToken } = await getB2Auth();

    const uploadUrlRes = await fetch(`${apiUrl}/b2api/v2/b2_get_upload_url`, {
      method: 'POST',
      headers: { Authorization: authorizationToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucketId: BUCKET_ID })
    });

    if (!uploadUrlRes.ok) {
      const errText = await uploadUrlRes.text();
      throw new Error('Failed to get upload URL: ' + errText);
    }

    const { uploadUrl, authorizationToken: uploadAuthToken } = await uploadUrlRes.json();

    const sha1 = crypto.createHash('sha1').update(fileBuffer).digest('hex');
    const encodedFileName = encodeURIComponent(key);

    const b2Res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: uploadAuthToken,
        'X-Bz-File-Name': encodedFileName,
        'Content-Type': file.mimetype || 'application/octet-stream',
        'X-Bz-Content-Sha1': sha1
      },
      body: fileBuffer
    });

    if (!b2Res.ok) {
      const errText = await b2Res.text();
      console.error('B2 upload failed:', errText);
      return res.status(b2Res.status).json({ error: 'Upload failed', details: errText });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Internal error', message: err.message });
  }
}

// Helper function to read file from temp location
async function readFile(filepath) {
  return await fs.readFile(filepath);
}