const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(output, filename);
};

const { DARK_COLORS, LIGHT_COLORS, contrastRatio } = require('../src/theme.ts');

const contentSurfaces = ['paper', 'card', 'sagePale', 'peach', 'yellow', 'lavender', 'blue'];
const stressSurfaces = ['stress1', 'stress2', 'stress3', 'stress4', 'stress5'];

function assertNormalTextContrast(name, foreground, background) {
  const ratio = contrastRatio(foreground, background);
  assert.ok(ratio >= 4.5, `${name} contrast was ${ratio.toFixed(2)}:1; expected at least 4.5:1`);
}

for (const [themeName, colors] of [['light', LIGHT_COLORS], ['dark', DARK_COLORS]]) {
  test(`${themeName} secondary and accent text remain readable on content surfaces`, () => {
    for (const surface of contentSurfaces) {
      assertNormalTextContrast(`${themeName} muted on ${surface}`, colors.muted, colors[surface]);
      assertNormalTextContrast(`${themeName} accent on ${surface}`, colors.accentText, colors[surface]);
    }
  });

  test(`${themeName} goal text remains readable across every move colour`, () => {
    for (const surface of stressSurfaces) {
      assertNormalTextContrast(`${themeName} goal text on ${surface}`, colors.ink, colors[surface]);
      assertNormalTextContrast(`${themeName} moved text on ${surface}`, colors.moved, colors[surface]);
    }
  });

  test(`${themeName} primary controls and alerts retain normal-text contrast`, () => {
    assertNormalTextContrast(`${themeName} primary control`, colors.white, colors.accentSolid);
    assertNormalTextContrast(`${themeName} danger control`, colors.danger, colors.card);
    assertNormalTextContrast(`${themeName} toast`, colors.toastText, colors.toastBackground);
  });
}
