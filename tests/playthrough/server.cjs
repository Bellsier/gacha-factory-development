'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
// CI provides the checked-out SHA; local runs may include uncommitted test work.
const sha = process.env.QA_SOURCE_SHA || 'local-uncommitted-checkout';
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (pathname === '/__qa_source') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ sha, baseline: 'f5169308b1659913119f8b035e5998a0543c538d', origin: 'isolated-localhost' }));
    }
    if (pathname === '/favicon.ico') return res.writeHead(204).end();
    if (pathname !== '/' && !/^\/(index\.html|(?:js|css)\/.+)$/.test(pathname)) return res.writeHead(404).end();
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
server.listen(4177, '127.0.0.1', () => console.log('Isolated QA localhost ready at port 4177; source ' + sha));
const close = () => server.close(() => process.exit(0));
process.on('SIGTERM', close);
process.on('SIGINT', close);
