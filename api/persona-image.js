require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const IMG_DIR = path.join(__dirname, '..', 'persona-images');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).end();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'no_gemini_key' });

  // Deterministic filename from prompt content
  const imageKey = crypto.createHash('md5').update(prompt).digest('hex');
  const imgPath  = path.join(IMG_DIR, `${imageKey}.png`);

  // Serve cached image if it exists
  if (fs.existsSync(imgPath)) {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    return fs.createReadStream(imgPath).pipe(res);
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1, aspectRatio: '16:9', personGeneration: 'DONT_ALLOW' },
        }),
      }
    );

    const body = await response.text();
    if (!response.ok) {
      console.error('Imagen 4 error:', response.status, body);
      return res.status(502).json({ error: body });
    }

    const data = JSON.parse(body);
    const b64  = data.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) return res.status(502).end();

    const buffer = Buffer.from(b64, 'base64');
    fs.mkdirSync(IMG_DIR, { recursive: true });
    fs.writeFileSync(imgPath, buffer);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(buffer);
  } catch (e) {
    console.error('persona-image error:', e);
    res.status(500).end();
  }
};
