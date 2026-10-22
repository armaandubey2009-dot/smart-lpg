// Smart LPG cloud server - no dependencies needed. Runs on Render (Node.js).
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 3000;
const DEVICE_KEY = process.env.DEVICE_KEY || 'change-me';      // must match the ESP code
const VIEW_USER = process.env.VIEW_USER || 'admin';
const VIEW_PASSWORD = process.env.VIEW_PASSWORD || '';          // set this on Render!
let state = null, lastSeen = 0, events = [];

function authed(req) {
  if (!VIEW_PASSWORD) return true;
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const [u, ...p] = Buffer.from(h.slice(6), 'base64').toString().split(':');
  return u === VIEW_USER && p.join(':') === VIEW_PASSWORD;
}
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (req.method === 'POST' && url === '/api/update') {          // from the ESP8266
    if (req.headers['x-api-key'] !== DEVICE_KEY) { res.writeHead(401); return res.end(); }
    let b = '';
    req.on('data', c => { b += c; if (b.length > 4000) req.destroy(); });
    req.on('end', () => {
      try {
        const d = JSON.parse(b);
        if (!state || state.status !== d.status || state.mq2 !== d.mq2 || state.air !== d.air) {
          events.unshift({ t: Date.now(), status: d.status, mq2: d.mq2, air: d.air, reason: d.reason });
          events = events.slice(0, 15);
        }
        state = d; lastSeen = Date.now();
        json(res, 200, { ok: true });
      } catch (e) { json(res, 400, { ok: false }); }
    });
    return;
  }
  if (!authed(req)) { res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Gas Dashboard"' }); return res.end('Login required'); }
  if (url === '/api/state') return json(res, 200, { state, events, age: state ? Math.round((Date.now() - lastSeen) / 1000) : null, now: Date.now() });
  if (url === '/' || url === '/index.html') {
    const file = [path.join(__dirname, 'public', 'index.html'), path.join(__dirname, 'index.html')].find(f => fs.existsSync(f));
    if (!file) { res.writeHead(500); return res.end('Missing index.html'); }
    return fs.readFile(file, (e, data) => {
      if (e) { res.writeHead(500); return res.end('Could not read index.html'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(data);
    });
  }
  res.writeHead(404); res.end('Not found');
}).listen(PORT, () => console.log('Running on port ' + PORT));
