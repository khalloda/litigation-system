import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** A task-owned extension drives Chrome's actual tab zoom, never CSS/pinch zoom.
 * It has no content script, remote endpoint or access to project credentials. */
export function staffZoomExtension(mirror) {
  const directory = join(mirror, 'browser-zoom-extension');
  mkdirSync(directory);
  writeFileSync(
    join(directory, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      name: 'Local staff accessibility zoom proof',
      version: '1.0',
      permissions: ['tabs'],
      background: { service_worker: 'worker.js' },
    }),
  );
  writeFileSync(join(directory, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
  return directory;
}

export async function proveStaffBrowserZoom({ context, page, audit, screenshot, evidence, name }) {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const viewport = page.viewportSize();
  const cdp = await context.newCDPSession(page);
  const zoom = async (factor) =>
    worker.evaluate(
      async ({ url, factor }) => {
        const tabs = await chrome.tabs.query({});
        const matches = tabs.filter((tab) => tab.url === url);
        if (matches.length !== 1) throw new Error('exact owned zoom tab required');
        await chrome.tabs.setZoom(matches[0].id, factor);
        return chrome.tabs.getZoom(matches[0].id);
      },
      { url: page.url(), factor },
    );
  const metrics = () =>
    page.evaluate(() => ({
      width: innerWidth,
      outerWidth,
      dpr: devicePixelRatio,
      visualScale: visualViewport.scale,
      cssZoom: getComputedStyle(document.documentElement).zoom,
    }));
  try {
    // Device-metric overrides pin CSS width and would conceal actual browser
    // reflow. Clear them and set the task-owned native window, not a viewport.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', {
      windowId,
      bounds: { width: 1440, height: 1000 },
    });
    assert.equal(await zoom(1), 1);
    const before = await metrics();
    assert.equal(before.width, 1440);
    assert.equal(await zoom(2), 2);
    await page.waitForFunction((dpr) => devicePixelRatio === dpr * 2, before.dpr);
    const after = await metrics();
    assert.ok(Math.abs(after.width * 2 - before.width) <= 1, 'actual browser zoom must reflow');
    assert.equal(after.outerWidth, before.outerWidth);
    assert.equal(after.cssZoom, '1');
    assert.equal(after.visualScale, 1);
    await audit(name + ' genuine browser zoom 200%', { variants: false });
    await screenshot(name + '-browser-zoom-200');
    evidence.push({ name: name + ' native zoom contract', before, after, browserZoom: 2 });
  } finally {
    await zoom(1);
    if (viewport) await page.setViewportSize(viewport);
    await cdp.detach();
  }
}

/** Inspect the browser's accessibility tree, not a DOM-shaped substitute.
 * This proves the programmatic contract; it makes no screen-reader speech claim. */
export async function staffAccessibilityTree(context, page, record = () => {}) {
  const cdp = await context.newCDPSession(page);
  try {
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const tree = nodes
      .filter((node) => !node.ignored)
      .map((node) => ({
        role: node.role?.value,
        name: node.name?.value,
        description: node.description?.value,
        properties: Object.fromEntries(
          (node.properties ?? []).map((property) => [property.name, property.value.value]),
        ),
      }));
    record(tree);
    for (const node of tree) {
      if (['button', 'link', 'textbox', 'searchbox', 'combobox', 'dialog'].includes(node.role))
        assert.ok(node.name?.trim(), 'accessible control name missing: ' + node.role);
      if (['alert', 'status'].includes(node.role)) {
        assert.equal(node.properties.live, node.role === 'alert' ? 'assertive' : 'polite');
        assert.equal(node.properties.atomic, true, 'feedback must expose atomic text');
      }
      if (node.role === 'textbox' && node.properties.required === true)
        assert.ok(
          node.description?.trim(),
          'required field must expose its instructions in the accessibility tree',
        );
      if (node.role === 'dialog') {
        assert.equal(node.properties.modal, true);
        assert.ok(node.description?.trim(), 'dialog consequences must be described');
      }
    }
    if (
      !tree.some((node) => node.role === 'dialog') &&
      /\/staff\/(new|\d+\/edit)$/u.test(new URL(page.url()).pathname)
    ) {
      const expected = await page.evaluate(() => {
        const invalidFields = Array.from(
          document.querySelectorAll('form [role="alert"] a[href^="#"]'),
        ).map((link) => document.getElementById(link.getAttribute('href').slice(1)));
        if (invalidFields.some((field) => !field))
          throw new Error('invalid field link has no destination');
        const fields = new Set([
          ...document.querySelectorAll(
            'input[name="nameAr"], input[name="alias"], textarea[name="reason"]',
          ),
          ...invalidFields,
        ]);
        return Array.from(fields).map((field) => ({
          name: document.querySelector(`label[for="${field.id}"]`)?.textContent,
          role: field.tagName === 'SELECT' ? 'combobox' : 'textbox',
          required: ['nameAr', 'alias', 'reason'].includes(field.getAttribute('name')),
          invalid: invalidFields.includes(field),
          markedInvalid: field.getAttribute('aria-invalid') === 'true',
          error: invalidFields.includes(field)
            ? field.closest('form')?.querySelector('[role="alert"] p')?.textContent
            : null,
        }));
      });
      for (const field of expected) {
        if (field.invalid)
          assert.equal(field.markedInvalid, true, 'summary destination must be marked invalid');
        const matches = tree.filter(
          (node) =>
            node.role === field.role &&
            node.name === field.name &&
            (!field.invalid || node.properties.invalid === 'true'),
        );
        assert.ok(
          matches.length > 0,
          'expected accessible field/invalid state missing: ' + field.name,
        );
        assert.ok(
          matches.some(
            (node) =>
              (!field.required || node.properties.required === true) &&
              node.description?.trim() &&
              (!field.error || node.description.includes(field.error)),
          ),
          'required state, instructions or validation description missing: ' + field.name,
        );
      }
    }
    return tree;
  } finally {
    await cdp.detach();
  }
}

export async function staffComputedTargets(page) {
  const targets = await page
    .locator('main a, main button, main input, main select, main textarea')
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.visibility === 'visible' &&
            style.display !== 'none' &&
            rect.width > 1 &&
            rect.height > 1 &&
            !element.closest('dialog:not([open])')
          );
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            id: element.id,
            name: element.getAttribute('name'),
            width: rect.width,
            height: rect.height,
            inlineVisible: rect.left >= 0 && rect.right <= innerWidth + 1,
            direction: getComputedStyle(element).direction,
          };
        }),
    );
  assert.deepEqual(
    targets.filter((target) => target.width < 44 || target.height < 44 || !target.inlineVisible),
    [],
    'computed targets must be at least 44 by 44 CSS pixels and horizontally unclipped',
  );
  for (const target of targets.filter((target) => target.name === 'email'))
    assert.equal(target.direction, 'ltr');
  return targets;
}

export async function staffFocusProof(page) {
  const proof = await page.locator(':focus').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const x = Math.min(innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
    const y = Math.min(innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
    const top = document.elementFromPoint(x, y);
    let background = element.parentElement;
    while (background && getComputedStyle(background).backgroundColor === 'rgba(0, 0, 0, 0)')
      background = background.parentElement;
    return {
      tag: element.tagName,
      name: element.getAttribute('name'),
      text: element.textContent,
      outline: style.outlineStyle,
      outlineWidth: parseFloat(style.outlineWidth),
      outlineColor: style.outlineColor,
      rectangle: { top: rect.top, bottom: rect.bottom, height: rect.height, viewport: innerHeight },
      background: background ? getComputedStyle(background).backgroundColor : 'rgb(255, 255, 255)',
      unobscured: top === element || element.contains(top),
      inViewport: rect.top >= 0 && rect.bottom <= innerHeight + 1,
    };
  });
  assert.notEqual(proof.outline, 'none', 'keyboard focus must be visible');
  assert.ok(proof.outlineWidth >= 2);
  assert.equal(proof.unobscured, true, 'focus must not be covered');
  assert.equal(proof.inViewport, true, 'focused control must be in view: ' + JSON.stringify(proof));
  const luminance = (rgb) => {
    const channels = rgb
      .match(/[\d.]+/gu)
      .slice(0, 3)
      .map(Number);
    return channels
      .map((c) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  };
  const values = [luminance(proof.outlineColor), luminance(proof.background)].sort((a, b) => a - b);
  const contrast = (values[1] + 0.05) / (values[0] + 0.05);
  assert.ok(contrast >= 3, 'focus indicator contrast must be at least 3:1');
  return { ...proof, contrast };
}

export async function staffDialogKeyboard(page) {
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  const buttons = dialog.getByRole('button');
  assert.equal(await buttons.count(), 2);
  const proof = [];
  for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    assert.equal(
      await page.locator(':focus').evaluate((element) => Boolean(element.closest('dialog[open]'))),
      true,
      'confirmation focus must remain inside its modal dialog',
    );
    proof.push(await staffFocusProof(page));
  }
  return proof;
}
