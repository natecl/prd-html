#!/usr/bin/env node
'use strict';
// Pack a PRD markdown file into a self-contained interactive HTML view.
// Usage: node generate.js <prd.md> [output.html]
const fs = require('fs');
const path = require('path');

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Returns the rendered HTML string. Pure given the template on disk.
function generate(md, opts = {}) {
  const tpl = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
  const h1 = md.match(/^#\s+(.+)$/m);
  const title = opts.title || (h1 ? h1[1].trim() : 'PRD');
  const prdPath = opts.prdPath || 'prd.md';
  // Embed markdown as a JSON string; escape '<' so a literal </script> in the
  // PRD can't terminate the data block early.
  const json = JSON.stringify(md).replace(/</g, '\\u003c');
  return tpl
    .split('{{TITLE}}').join(escapeHtml(title))
    .split('{{PRD_PATH}}').join(escapeHtml(prdPath))
    // function replacement: PRD content may contain `$`, which is special in
    // a string replacement value but inert in a replacer function.
    .replace('{{PRD_JSON}}', () => json);
}

module.exports = { generate };

if (require.main === module) {
  const [, , mdPath, outArg] = process.argv;
  if (!mdPath) {
    console.error('Usage: node generate.js <prd.md> [output.html]');
    process.exit(1);
  }
  const md = fs.readFileSync(mdPath, 'utf8');
  const html = generate(md, { prdPath: path.basename(mdPath) });
  const outPath = outArg || mdPath.replace(/\.md$/, '.html');
  fs.writeFileSync(outPath, html);
  console.log('Wrote ' + outPath);
}
