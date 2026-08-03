const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

async function readLayout(window) {
  return window.webContents.executeJavaScript(`(() => {
    const page = document.documentElement;
    const gallery = document.querySelector('.template-gallery');
    const preview = document.querySelector('#resume-preview');
    const editor = document.querySelector('#draft-editor');
    return {
      viewportWidth: page.clientWidth,
      pageScrollWidth: page.scrollWidth,
      galleryVisible: Boolean(gallery && gallery.getBoundingClientRect().height > 20),
      previewVisible: Boolean(preview && preview.getBoundingClientRect().height > 100),
      editorVisible: Boolean(editor && editor.getBoundingClientRect().height > 100),
      cardCount: document.querySelectorAll('[data-template-card]').length,
    };
  })()`);
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1100, height: 720, webPreferences: { sandbox: true } });
  try {
    await window.loadFile(path.join(__dirname, 'fixtures', 'studio-template-library.html'));
    const desktop = await readLayout(window);
    assert.equal(desktop.cardCount, 5);
    assert.equal(desktop.galleryVisible, true);
    assert.equal(desktop.previewVisible, true);
    assert.equal(desktop.editorVisible, true);
    assert.ok(desktop.pageScrollWidth <= desktop.viewportWidth + 1);

    window.setSize(680, 520);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const compact = await readLayout(window);
    assert.equal(compact.galleryVisible, true);
    assert.equal(compact.previewVisible, true);
    assert.equal(compact.editorVisible, true);
    assert.ok(compact.pageScrollWidth <= compact.viewportWidth + 1);
    console.log('Studio template library responsive smoke test passed (1100x720 and 680x520)');
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
});
