import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const rootRealPath = await realpath(root);
const host = process.env.HOST ?? '0.0.0.0';
const parsedPort = Number(process.env.PORT ?? 4173);
if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65_535) {
  throw new TypeError('PORT must be an integer between 1 and 65535.');
}
const port = parsedPort;

const publicFiles = new Set([
  '/index.html',
  '/styles.css',
  '/src/app.js',
  '/src/core.js',
  '/src/scopeCompiler.js',
  '/src/webmcp.js',
]);

const contentTypes = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
});

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
].join('; ');

const securityHeaders = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Content-Security-Policy': contentSecurityPolicy,
});

function send(res, statusCode, body, headers = {}, method = 'GET') {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(statusCode, {
    ...securityHeaders,
    'Content-Length': String(data.length),
    ...headers,
  });
  if (method === 'HEAD') res.end();
  else res.end(data);
}

function isWithinRoot(candidatePath) {
  return candidatePath === rootRealPath || candidatePath.startsWith(`${rootRealPath}${path.sep}`);
}

const server = http.createServer(async (req, res) => {
  const method = req.method ?? 'GET';
  try {
    if ((req.url?.length ?? 0) > 2_048) {
      send(res, 414, 'URI too long', {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      }, method);
      return;
    }
    if (!['GET', 'HEAD'].includes(method)) {
      send(res, 405, 'Method not allowed', {
        Allow: 'GET, HEAD',
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      }, method);
      return;
    }

    const url = new URL(req.url ?? '/', 'http://localhost');
    let relativePath = decodeURIComponent(url.pathname);
    if (relativePath.includes('\0')) throw new Error('Invalid path');
    if (relativePath === '/' || relativePath === '') relativePath = '/index.html';
    if (!publicFiles.has(relativePath)) throw new Error('Not a public runtime asset');

    const requestedPath = path.resolve(root, `.${relativePath}`);
    if (!isWithinRoot(requestedPath)) throw new Error('Forbidden path');

    const filePath = await realpath(requestedPath);
    if (!isWithinRoot(filePath)) throw new Error('Forbidden symlink target');

    const fileInfo = await stat(filePath);
    if (!fileInfo.isFile()) throw new Error('Not a file');

    const data = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    send(res, 200, data, {
      'Content-Type': contentTypes[extension] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    }, method);
  } catch {
    send(res, 404, 'Not found', {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    }, method);
  }
});

server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 64;

server.on('clientError', (_error, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

server.on('error', (error) => {
  console.error(`LASSO server failed: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  const displayHost = host === '0.0.0.0' ? 'localhost' : host;
  console.log(`LASSO v0.3 running at http://${displayHost}:${port}`);
});
