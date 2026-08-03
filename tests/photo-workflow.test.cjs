const assert = require('node:assert/strict');
const test = require('node:test');
const { portraitCrop } = require('../electron/photo-workflow.cjs');

test('center-crops landscape photos to a 3:4 portrait', () => {
  assert.deepEqual(portraitCrop({ width: 1600, height: 900 }), { x: 463, y: 0, width: 675, height: 900 });
});

test('center-crops tall photos to a 3:4 portrait', () => {
  assert.deepEqual(portraitCrop({ width: 600, height: 1200 }), { x: 0, y: 200, width: 600, height: 800 });
});
