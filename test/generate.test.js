'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { generate } = require('../generate.js');

const DATA_RE = /<script id="prd-data" type="application\/json">([\s\S]*?)<\/script>/;

test('uses the first H1 as the title', () => {
  const html = generate('# My Feature\n\nbody\n', { prdPath: 'my-feature.md' });
  assert.match(html, /<title>My Feature/);
  assert.match(html, />my-feature\.md</);
});

test('round-trips the markdown verbatim through the embedded JSON', () => {
  const md = '# X\n\n**bold**, a $dollar, a `code` span, and emoji 🌳.\n';
  const html = generate(md, {});
  const m = html.match(DATA_RE);
  assert.ok(m, 'has prd-data block');
  assert.strictEqual(JSON.parse(m[1]), md);
});

test('a literal </script> in the PRD cannot terminate the data block', () => {
  const md = '# Y\n\nDanger: </script><script>alert(1)</script>\n';
  const html = generate(md, {});
  const m = html.match(DATA_RE);
  assert.ok(m, 'data block still parses as one block');
  assert.ok(!m[1].includes('</script>'), 'no raw </script> inside the block');
  assert.strictEqual(JSON.parse(m[1]), md);
});

test('no template placeholders remain', () => {
  const html = generate('# Z\n', {});
  assert.ok(!html.includes('{{'), 'all {{...}} placeholders substituted');
});

test('renders the on-disk sample without leftover placeholders', () => {
  const md = fs.readFileSync(path.join(__dirname, 'sample.prd.md'), 'utf8');
  const html = generate(md, { prdPath: 'sample.prd.md' });
  assert.ok(!html.includes('{{'));
  assert.strictEqual(JSON.parse(html.match(DATA_RE)[1]), md);
  assert.match(html, /<title>Sample Feature/);
});
