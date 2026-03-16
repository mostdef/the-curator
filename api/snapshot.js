const fs   = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'snapshots');

module.exports = async function handler(req, res) {
  if (req.method === 'POST') {
    const snap = req.body;
    const ts   = snap.ts || Date.now();
    const file = path.join(DIR, `${ts}.json`);
    fs.writeFileSync(file, JSON.stringify(snap, null, 2));
    return res.json({ ok: true, file: path.basename(file) });
  }

  if (req.method === 'GET') {
    const files = fs.readdirSync(DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();
    const snapshots = files.map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); }
      catch(e) { return null; }
    }).filter(Boolean);
    return res.json(snapshots);
  }

  res.status(405).end();
};
