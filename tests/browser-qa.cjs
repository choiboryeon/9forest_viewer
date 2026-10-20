const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

let playwright;
try { playwright = require('playwright'); }
catch (error) {
  if (!process.env.PLAYWRIGHT_MODULE) throw error;
  playwright = require(process.env.PLAYWRIGHT_MODULE);
}

const url = process.env.VIEWER_URL || 'http://127.0.0.1:4186/9forest_viewer.html';
const output = path.resolve(__dirname, '../test-results/browser');
const results = [];
const errors = [];
let browser, page;
const state = p => p.evaluate(() => window.nineforestLayout.state());
const frames = p => p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const serialItems = items => items.map(({ type, mode, x, y, height, rotation, tiltX, tiltY }) => ({ type, mode, x, y, height, rotation, tiltX, tiltY }));
const last = async p => (await state(p)).items.at(-1);
const near = (actual, expected, message, epsilon = 0.015) => assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} vs ${expected}`);

function observe(p) {
  p.on('pageerror', error => errors.push(error.message));
  p.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  p.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
}

async function ready(p) {
  await p.waitForFunction(() => window.nineforestLayout?.state().renderTriangles > 0, null, { timeout: 45000 });
  assert.equal(await p.locator('#status').isVisible(), false, 'Loading screen dismissed');
  await frames(p);
}

async function setSpace(id) {
  await page.locator('#space-select').selectOption(id);
  await page.waitForFunction(value => window.nineforestLayout.state().spaceId === value, id);
  await frames(page);
}

async function number(selector, value) {
  await page.locator(selector).fill(String(value));
  await page.locator(selector).press('Tab');
  await frames(page);
}

async function check(name, run) {
  await run();
  results.push(name);
  console.log(`PASS ${name}`);
}

async function exerciseSpace(id) {
  const before = (await state(page)).items.length;
  await page.locator('[data-add="R03"]').click();
  assert.equal((await state(page)).items.length, before + 1);
  assert.equal((await last(page)).type, 'R03');
  await page.locator('[data-mode="floor"]').click();
  await number('#pos-x', 2.8);
  await number('#pos-y', 2.0);
  await number('#rotation', 35);
  await number('#tiltX', -10);
  await number('#tiltY', 15);
  let item = await last(page);
  near(item.x, 2.8, `${id} X edit`);
  near(item.y, 2, `${id} Y edit`);
  near(item.rotation, 35, `${id} rotation edit`);
  near(item.tiltX, -10, `${id} tilt X edit`);
  near(item.tiltY, 15, `${id} tilt Y edit`);
  for (const mode of ['rod', 'hang', 'plinth', 'floor']) {
    await page.locator(`[data-mode="${mode}"]`).click();
    assert.equal((await last(page)).mode, mode);
    if (mode === 'rod' || mode === 'hang') {
      await number('#height', .7);
      near((await last(page)).height, .7, `${id} ${mode} height`);
    }
  }
  await page.locator('#duplicate').click();
  assert.equal((await state(page)).items.length, before + 2);
  item = await last(page);
  near(item.rotation, 35, `${id} duplicate rotation`);
  near(item.tiltX, -10, `${id} duplicate tilt`);
  await page.locator('#remove').click();
  assert.equal((await state(page)).items.length, before + 1);
  await page.locator('.placed-row').last().click();
  await page.locator('#reset-rotation').click();
  await page.locator('[data-view="top"]').click();
  await frames(page);
  const old = await last(page);
  const point = await page.evaluate(() => window.nineforestLayout.projectSelected());
  assert.ok(point && Number.isFinite(point.x) && Number.isFinite(point.y), 'Selected object projects to screen');
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 30, point.y + 20, { steps: 8 });
  await page.mouse.up();
  await frames(page);
  item = await last(page);
  assert.ok(Math.hypot(item.x - old.x, item.y - old.y) > .04, `${id} pointer drag changes position`);
  await page.screenshot({ path: path.join(output, `${id}-plan.png`) });
  await page.locator('[data-view="3d"]').click();
  await frames(page);
  return serialItems((await state(page)).items);
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  browser = await playwright.chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }),
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']
  });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  observe(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await ready(page);
  await check('Nightshift default scene and compatible API alias', async () => {
    assert.equal((await state(page)).spaceId, 'nightshift');
    assert.equal((await state(page)).items.length, 5);
    assert.equal(await page.evaluate(() => window.nightshiftLayout === window.nineforestLayout), true);
    assert.equal(await page.locator('[data-add]').count(), 20);
  });
  let nightshift;
  await check('Nightshift add, edit, mount, duplicate, remove and pointer drag', async () => {
    nightshift = await exerciseSpace('nightshift');
  });
  await page.screenshot({ path: path.join(output, 'nightshift-desktop.png') });
  await setSpace('wess');
  await check('WESS starts empty and has geometry', async () => {
    assert.equal((await state(page)).items.length, 0);
    assert.match(await page.locator('#stage-title').textContent(), /WESS/);
    assert.ok((await state(page)).renderTriangles > 1000);
  });
  await check('WESS add, edit, mount, duplicate, remove and pointer drag', () => exerciseSpace('wess'));
  await check('WESS lobby supports negative Y and raised room uses +30 mm floor', async () => {
    await number('#pos-x', 9.15);
    await number('#pos-y', -1.1);
    near((await last(page)).x, 9.15, 'Lobby X');
    near((await last(page)).y, -1.1, 'Lobby negative Y');
    near((await last(page)).floorZ, 0, 'Lobby floor', .0001);
    assert.ok(Number(await page.locator('#pos-y').getAttribute('min')) < 0);
    await number('#pos-x', 9.3);
    await number('#pos-y', 3);
    near((await last(page)).x, 9.3, 'Raised room X');
    near((await last(page)).y, 3, 'Raised room Y');
    near((await last(page)).floorZ, .03, 'Raised room floor', .0001);
  });
  const wess = serialItems((await state(page)).items);
  await page.screenshot({ path: path.join(output, 'wess-desktop.png') });
  await page.locator('[data-view="top"]').click();
  await frames(page);
  await page.screenshot({ path: path.join(output, 'wess-plan.png') });
  await check('Layouts persist independently on switch and reload', async () => {
    await setSpace('nightshift');
    assert.deepEqual(serialItems((await state(page)).items), nightshift);
    await setSpace('wess');
    assert.deepEqual(serialItems((await state(page)).items), wess);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page);
    await setSpace('nightshift');
    assert.deepEqual(serialItems((await state(page)).items), nightshift);
    await setSpace('wess');
    assert.deepEqual(serialItems((await state(page)).items), wess);
  });
  let exported;
  await check('WESS JSON download identifies the space and contains edited items', async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#save-layout').click()]);
    assert.match(download.suggestedFilename(), /wess.*\.json$/i);
    const downloaded = path.join(output, download.suggestedFilename());
    await download.saveAs(downloaded);
    exported = JSON.parse(await fs.readFile(downloaded, 'utf8'));
    assert.equal(exported.version, 4);
    assert.equal(exported.space_id, 'wess');
    assert.deepEqual(serialItems(exported.items), wess);
  });
  await check('PNG export is named for WESS and has actual image content', async () => {
    await page.locator('#export-png').click();
    assert.equal(await page.locator('#export-modal').isVisible(), true);
    assert.match(await page.locator('#export-download').getAttribute('download'), /wess.*\.png$/i);
    assert.ok(await page.locator('#export-image').evaluate(img => img.complete && img.naturalWidth > 300));
    await page.locator('#close-modal').click();
  });
  await check('Legacy v3 import resolves to Nightshift', async () => {
    const legacy = { version: 3, items: [{ type: 'R03', mode: 'floor', x: 2, y: 2, height: 0, rotation: 15, tiltX: 0, tiltY: 0 }] };
    await page.evaluate(data => window.nineforestLayout.importLayout(data), legacy);
    assert.equal((await state(page)).spaceId, 'nightshift');
    assert.equal((await state(page)).items.length, 1);
    near((await last(page)).rotation, 15, 'Legacy rotation');
  });
  await check('Importing WESS file switches space and restores layout', async () => {
    await page.locator('#layout-file').setInputFiles({
      name: 'wess-layout.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported))
    });
    await page.waitForFunction(() => window.nineforestLayout.state().spaceId === 'wess');
    assert.deepEqual(serialItems((await state(page)).items), wess);
  });
  await check('Unsupported-space and invalid import leave current layout untouched', async () => {
    const before = await page.evaluate(() => window.nineforestLayout.exportLayout());
    for (const invalid of [{ ...exported, space_id: 'unknown-space' }, { ...exported, items: 'invalid' }]) {
      const rejected = await page.evaluate(data => {
        try { window.nineforestLayout.importLayout(data); return false; }
        catch { return true; }
      }, invalid);
      assert.equal(rejected, true, 'Invalid import rejected');
      assert.deepEqual(await page.evaluate(() => window.nineforestLayout.exportLayout()), before);
    }
  });
  await check('Switching spaces stops walking and restores editable view controls', async () => {
    for (const target of ['nightshift', 'wess']) {
      await page.locator('#walk-start').click();
      assert.equal((await state(page)).walking, true);
      assert.equal(await page.locator('#walls').isDisabled(), true);
      await setSpace(target);
      assert.equal((await state(page)).walking, false);
      assert.notEqual((await state(page)).view, 'walk');
      assert.equal(await page.locator('#walk-panel').isVisible(), false);
      assert.equal(await page.locator('#walls').isDisabled(), false);
      assert.equal(await page.locator('#walk-start').getAttribute('aria-pressed'), 'false');
    }
  });
  await check('Clearing WESS does not clear Nightshift', async () => {
    await page.locator('#clear-layout').click();
    assert.equal((await state(page)).items.length, 0);
    await setSpace('nightshift');
    assert.equal((await state(page)).items.length, 1);
    await page.evaluate(data => window.nineforestLayout.importLayout(data), exported);
  });
  await check('Mobile WESS has usable space selection, canvas and no horizontal overflow', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#space-select').scrollIntoViewIfNeeded();
    await setSpace('nightshift');
    await setSpace('wess');
    await page.locator('[data-view="top"]').click();
    await frames(page);
    const metrics = await page.evaluate(() => ({
      width: innerWidth, scroll: document.documentElement.scrollWidth,
      canvas: document.querySelector('#scene').getBoundingClientRect().toJSON()
    }));
    assert.ok(metrics.scroll <= metrics.width + 1, `Mobile horizontal overflow ${metrics.scroll}/${metrics.width}`);
    assert.ok(metrics.canvas.width > 300 && metrics.canvas.height > 250, 'Mobile canvas remains usable');
    await page.screenshot({ path: path.join(output, 'wess-mobile.png'), fullPage: true });
  });
  await check('No browser JavaScript, console or network errors', async () => assert.deepEqual(errors, []));
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ url, passed: results.length, checks: results, errors }, null, 2));
  console.log(JSON.stringify({ passed: results.length, output }, null, 2));
}

main().catch(async error => {
  console.error(error);
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ url, passed: results.length, checks: results, errors, failure: error.stack }, null, 2));
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
