// Serves the demo page and the plugin so the camera can run on localhost.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const PLUGIN_DIR = path.join(ROOT, 'plugin');
const PORT = Number(process.env.PORT) || 4179;
const HOST = process.env.HOST || '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function resolveFile(urlPath) {
  const pathname = decodeURIComponent(urlPath.split('?')[0]);
  const plugin = pathname === '/plugin' || pathname.startsWith('/plugin/');
  const root = plugin ? PLUGIN_DIR : PUBLIC_DIR;
  const rel = plugin
    ? pathname.replace(/^\/plugin\/?/, '') || 'index.html'
    : pathname.replace(/^\//, '') || 'index.html';

  const full = path.resolve(root, rel);
  const rootResolved = path.resolve(root);
  if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) return null;
  return full;
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-cache',
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method not allowed');
    return;
  }

  let file;
  try {
    file = resolveFile(req.url || '/');
  } catch {
    send(res, 400, 'Bad request');
    return;
  }
  if (!file) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.stat(file, (statErr, stat) => {
    if (!statErr && stat.isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) {
        send(res, 404, 'Not found');
        return;
      }
      const type = TYPES[path.extname(file)] || 'application/octet-stream';
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
        res.end();
        return;
      }
      send(res, 200, data, type);
    });
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already taken. Try: PORT=4180 npm start\n`);
  } else {
    console.error('\n  Server failed to start:', err.message, '\n');
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Scroll-With-Eye is up.');
  console.log('');
  console.log(`  Open   http://localhost:${PORT}`);
  console.log('');
});
