// Zero-dependency static server for ./public on port 8000.
// No host argument, so it answers on both http://localhost:8000 (the page)
// and http://127.0.0.1:8000 (the cross-origin iframe).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';

const PORT = 8000;
const ROOT = join(import.meta.dirname, 'public');

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  const file = normalize(join(ROOT, path === '/' ? 'index.html' : path));
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, () => console.log(`Serving on http://localhost:${PORT}`));
