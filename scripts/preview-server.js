// 브라우저 미리보기용 정적 서버: http://localhost:5174/src/renderer/index.html
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 5174);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') {
      res.writeHead(302, { Location: '/src/renderer/index.html' });
      return res.end();
    }
    let file;
    try {
      file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
    } catch {
      res.writeHead(400);
      return res.end('bad request');
    }
    if (!file.startsWith(ROOT + path.sep)) {
      res.writeHead(403);
      return res.end();
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end('not found');
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  })
  // 이 컴퓨터에서만 연다 (같은 네트워크의 다른 기기는 못 들어온다)
  .listen(PORT, '127.0.0.1', () => console.log(`미리보기: http://localhost:${PORT}/src/renderer/index.html`));
