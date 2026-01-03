const express = require('express');
const cors = require('cors');
const { Buffer } = require('buffer');
const multer = require('multer');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

const B2_KEY_ID = '0033bed499501450000000002';
const B2_APPLICATION_KEY = 'K0032ZG3IYROgkaVsMVwSdNTSANgX4E';
const BUCKET_ID = '233b1e5d04b9492590b10415';
const RESTRICTED_ROOT = 'public/templates/';

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]
}));

// Статика — иконки
app.use('/icons', express.static('public/icons'));

// Multer
const upload = multer({
  limits: { fileSize: 20 * 1024 * 1024 },
  storage: multer.memoryStorage()
});

// B2 Auth — исправлено: убраны лишние пробелы
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

// Эндпоинты
app.get('/api/b2/authorize', async (req, res) => {
  try {
    const data = await getB2Auth();
    res.json(data);
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Internal error', message: err.message });
  }
});

app.post('/api/b2/upload-file', upload.single('file'), async (req, res) => {
  try {
    const { key } = req.query;
    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "key" query param' });
    }

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

    const sha1 = crypto.createHash('sha1').update(req.file.buffer).digest('hex');
    const encodedFileName = encodeURIComponent(key);

    const b2Res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: uploadAuthToken,
        'X-Bz-File-Name': encodedFileName,
        'Content-Type': req.file.mimetype || 'application/octet-stream',
        'X-Bz-Content-Sha1': sha1
      },
      body: req.file.buffer
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
});

app.post('/api/b2/create-folder', async (req, res) => {
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
});

app.post('/api/b2/delete-item', async (req, res) => {
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
});

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

app.get('/api/b2/download-file', async (req, res) => {
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
    res.set('Content-Type', file.contentType || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName.split('/').pop())}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/b2/b2_list_file_names', async (req, res) => {
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
});

// ✅ ЗАПУСК СЕРВЕРА — только для локальной разработки
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});