import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const file = new URL('../src/styles/theme.css', import.meta.url);
test('brand stylesheet exists and centralizes mandatory PRD colors', () => {
  assert.ok(existsSync(file), 'The imported brand stylesheet must exist before Vite can build');
  const css = readFileSync(file, 'utf8');
  assert.match(css, /--brand-primary:\s*#06509B/i);
  assert.match(css, /--brand-accent:\s*#F1D043/i);
  assert.match(css, /\.sidebar/);
  assert.match(css, /\.login-page/);
});
test('brand stylesheet supports accessible responsive navigation and uncropped logos', () => {
  assert.ok(existsSync(file), 'The imported brand stylesheet must exist');
  const css = readFileSync(file, 'utf8');
  assert.match(css, /@media\s*\(max-width:\s*1099px\)/);
  assert.match(css, /\.sidebar\.is-open/);
  assert.match(css, /object-fit:\s*contain/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});
