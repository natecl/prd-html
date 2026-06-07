#!/usr/bin/env node
'use strict';
// Serve a generated PRD .html and proxy its chat panel to Claude Code (`claude -p`).
// Uses your Claude Code subscription — no ANTHROPIC_API_KEY, no per-token billing.
// Usage: node serve.js <file.html> [port]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

const [, , htmlArg, portArg] = process.argv;
if (!htmlArg) {
  console.error('Usage: node serve.js <file.html> [port]');
  process.exit(1);
}
const htmlPath = path.resolve(htmlArg);
if (!fs.existsSync(htmlPath)) {
  console.error('No such file: ' + htmlPath);
  process.exit(1);
}
const mdPath = htmlPath.replace(/\.html$/, '.md');
const port = parseInt(portArg, 10) || 4317;

// Run claude from the nearest git repo root so it has project context + can
// resolve the PRD's relative path; fall back to the file's directory.
function findRepoRoot(start) {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}
const cwd = findRepoRoot(path.dirname(htmlPath));
const mdRel = path.relative(cwd, mdPath) || path.basename(mdPath);

const SYSTEM = `You are helping the user review and refine a Product Requirements Document (PRD).
The PRD file is at: ${mdRel} (relative to the current working directory).
- Answer questions about the PRD concisely.
- When the user asks for a change, edit ${mdRel} directly with the Edit tool, preserving its existing structure and markdown style, then state briefly what you changed.
- Do not modify any file other than ${mdRel} unless the user explicitly asks.
- Keep replies focused; this is a chat panel, not a terminal.
- Ignore repository workflow conventions (git commits, /learn, capture rules, worktrees, ADRs) — they do not apply here. Only help with this PRD; do not comment on repo state or uncommitted changes.`;

const sessionId = crypto.randomUUID();
let started = false;
let busy = false;

// Stream a turn over Server-Sent Events: text deltas as {delta}, then {done,reply}
// (or {error}). Always resolves — failures are reported as SSE frames, not throws.
function streamClaude(message, res) {
  return new Promise((resolve) => {
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--verbose',
      '--setting-sources', 'user',
      '--permission-mode', 'acceptEdits',
      '--allowedTools', 'Read,Edit,Glob,Grep',
      '--append-system-prompt', SYSTEM,
    ];
    args.push(started ? '--resume' : '--session-id', sessionId);

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    const send = (obj) => { try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch {} };

    let child;
    try {
      child = spawn('claude', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      send({ error: 'Could not launch `claude`: ' + e.message });
      res.end();
      return resolve();
    }

    const onClientGone = () => { try { child.kill(); } catch {} };
    res.on('close', onClientGone);

    let buf = '', errText = '', finalReply = '';
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let evt;
        try { evt = JSON.parse(line); } catch { continue; }
        if (
          evt.type === 'stream_event' && evt.event &&
          evt.event.type === 'content_block_delta' &&
          evt.event.delta && evt.event.delta.type === 'text_delta'
        ) {
          send({ delta: evt.event.delta.text });
        } else if (evt.type === 'result') {
          finalReply = evt.result != null ? evt.result : (evt.error || finalReply);
        }
      }
    });
    child.stderr.on('data', (d) => (errText += d));
    child.on('error', (e) => {
      res.off('close', onClientGone);
      send({ error: 'Could not run `claude` — is Claude Code installed and on your PATH? (' + e.message + ')' });
      res.end();
      resolve();
    });
    child.on('close', (code) => {
      res.off('close', onClientGone);
      if (code === 0 || finalReply) started = true;
      if (code !== 0 && !finalReply) {
        send({ error: 'claude exited with code ' + code + (errText ? ': ' + errText.trim() : '') });
      } else {
        send({ done: true, reply: finalReply });
      }
      res.end();
      resolve();
    });
    child.stdin.write(message);
    child.stdin.end();
  });
}

function sendFile(res, file, type) {
  fs.readFile(file, (e, data) => {
    if (e) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/chat') {
    // Localhost-only guard: reject cross-site POSTs and DNS-rebinding. A page on
    // the open web can't forge Origin, and a rebound request carries a foreign Host.
    const host = req.headers.host || '';
    const origin = req.headers.origin;
    const allowedHosts = ['127.0.0.1:' + port, 'localhost:' + port];
    if (!allowedHosts.includes(host) || (origin && origin !== 'http://' + host)) {
      res.writeHead(403, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'forbidden' }));
    }
    if (busy) {
      res.writeHead(429, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Still working on the previous message — wait for it to finish.' }));
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      busy = true;
      try {
        const { message } = JSON.parse(body || '{}');
        if (!message || !String(message).trim()) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'empty message' }));
          return;
        }
        await streamClaude(String(message), res);
      } catch (e) {
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        } else {
          try { res.write('data: ' + JSON.stringify({ error: e.message }) + '\n\n'); res.end(); } catch {}
        }
      } finally {
        busy = false;
      }
    });
    return;
  }
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    return sendFile(res, htmlPath, 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && req.url === '/prd.md') {
    return sendFile(res, mdPath, 'text/markdown; charset=utf-8');
  }
  res.writeHead(404);
  res.end('Not found');
});

server.listen(port, '127.0.0.1', () => {
  console.log('PRD served at  http://127.0.0.1:' + port);
  console.log('  PRD file:     ' + mdRel);
  console.log('  Working dir:  ' + cwd);
  console.log('  Chat backend: claude -p  (your Claude Code subscription — no API key)');
  console.log('  Tools:        Read, Edit, Glob, Grep   (auto-accept edits, no Bash)');
  console.log('Press Ctrl+C to stop.');
});
