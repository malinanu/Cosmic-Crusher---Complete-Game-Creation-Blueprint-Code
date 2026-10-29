#!/usr/bin/env node
/**
 * Local server for YouTube Playables SDK Test Suite
 * https://developers.google.com/youtube/gaming/playables/test_suite
 * 
 * Serves dist/youtube/ with:
 * - CORS headers (Access-Control-Allow-Origin: *)
 * - Frame embedding permissions (no X-Frame-Options blocking)
 * - YouTube recommended Content-Security-Policy (CSP) headers
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT, 10) || 8080;
const ROOT = path.resolve(__dirname, '..', 'dist', 'youtube');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8'
};

// YouTube Playables recommended Content Security Policy
const CSP = [
  "default-src 'none'",
  "script-src 'report-sample' 'self' 'unsafe-eval' 'unsafe-inline' blob: https://www.youtube.com/game_api/v0 https://www.youtube.com/game_api/v0/ https://www.youtube.com/game_api/v1 https://www.youtube.com/game_api/v1/",
  "object-src 'none'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self' data: https://fonts.googleapis.com https://fonts.gstatic.com",
  "connect-src 'self' blob: data:",
  "sandbox allow-pointer-lock allow-same-origin allow-scripts allow-forms",
  "base-uri 'self'",
  "manifest-src 'self'",
  "worker-src 'self' blob:"
].join('; ');

const server = http.createServer((req, res) => {
  // Common CORS headers for Test Suite iframe embedding
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const cleanUrl = decodeURIComponent(req.url.split('?')[0]);
  let filePath = path.join(ROOT, cleanUrl === '/' ? 'index.html' : cleanUrl);

  // Prevent directory traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  const headers = { 'Content-Type': contentType };

  // Apply CSP on HTML responses
  if (ext === '.html') {
    headers['Content-Security-Policy'] = CSP;
  }

  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 YouTube Playables Local Test Server is RUNNING!`);
  console.log(`======================================================`);
  console.log(`Local URL:    http://localhost:${PORT}/`);
  console.log(`Serving:      ${ROOT}`);
  console.log(`\nHow to test:`);
  console.log(`1. Open the YouTube Playables Test Suite in your browser:`);
  console.log(`   https://developers.google.com/youtube/gaming/playables/test_suite`);
  console.log(`2. In the "Game URL" input field, enter:`);
  console.log(`   http://localhost:${PORT}/`);
  console.log(`3. Click "Test" to run all automated checks.`);
  console.log(`======================================================\n`);
});

