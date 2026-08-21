const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(output, filename);
};

const { scrollOffsetForVisibleInput, visibleViewportBottom } = require('../src/keyboard-layout.ts');

test('the keyboard edge limits a viewport that Android still measures behind it', () => {
  assert.equal(visibleViewportBottom(720, 430), 430);
  assert.equal(visibleViewportBottom(420, 430), 420);
  assert.equal(visibleViewportBottom(720), 720);
});

test('a visible field keeps the current sheet scroll position', () => {
  assert.equal(scrollOffsetForVisibleInput({
    currentOffset: 40, inputTop: 220, inputBottom: 270, viewportTop: 100, viewportBottom: 400,
  }), 40);
});

test('an obscured field scrolls above the keyboard with breathing room', () => {
  assert.equal(scrollOffsetForVisibleInput({
    currentOffset: 40, inputTop: 380, inputBottom: 430, viewportTop: 100, viewportBottom: 400, extraOffset: 18,
  }), 88);
  assert.equal(scrollOffsetForVisibleInput({
    currentOffset: 0, inputTop: 380, inputBottom: 430, viewportTop: 100, viewportBottom: 400, extraOffset: 92,
  }), 122);
});

test('a field hidden above the viewport scrolls back toward the sheet start', () => {
  assert.equal(scrollOffsetForVisibleInput({
    currentOffset: 80, inputTop: 90, inputBottom: 140, viewportTop: 100, viewportBottom: 400,
  }), 62);
  assert.equal(scrollOffsetForVisibleInput({
    currentOffset: 5, inputTop: 70, inputBottom: 120, viewportTop: 100, viewportBottom: 400,
  }), 0);
});
