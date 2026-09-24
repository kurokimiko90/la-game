import { expect, test, type Page } from '@playwright/test';
import park from '../../src/data/scenes/park.json';
import street from '../../src/data/scenes/street.json';
import sceneIndex from '../../src/data/scenes/index.json';
import { FREE_SCENE_COUNT } from '../../src/lib/progress';

const itemByEn = new Map(park.items.map((i) => [i.words.en, i]));
type SceneJson = typeof park;
const zoneName = (zoneId: string, scene: SceneJson = park) => scene.zones.find((z) => z.id === zoneId)?.name ?? '';

async function unlockAll(page: Page) {
  await page.goto('/');
  await page.getByLabel('測試用：解鎖全部場景與關卡').check();
}

const canvas = (page: Page) => page.locator('[aria-label^="小鎮"]');

/** 物品在畫面上的中心；不在畫面內就把地圖拖過去（2D 地圖，一個區域不一定整個看得到） */
async function bringIntoView(page: Page, itemId: string) {
  const box = (await canvas(page).boundingBox())!;
  const item = (await page.locator(`[data-item-id="${itemId}"]`).boundingBox())!;
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  const inside = cx > box.x + 180 && cx < box.x + box.width - 80 && cy > box.y + 80 && cy < box.y + box.height - 60;
  if (inside) return;
  const tx = box.x + box.width / 2;
  const ty = box.y + box.height / 2;
  await page.mouse.move(tx, ty);
  await page.mouse.down();
  await page.mouse.move(tx - (cx - tx), ty - (cy - ty), { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}

/** 用導覽列跳到物品所在區域，再點物品真正露出來的那一點（避開被別的物品蓋住的部分） */
async function clickItem(page: Page, itemId: string, zoneId: string, scene: SceneJson = park) {
  await page.getByRole('button', { name: zoneName(zoneId, scene), exact: true }).click();
  await page.waitForTimeout(250);
  await bringIntoView(page, itemId);
  const point = await page.evaluate((id) => {
    const el = document.querySelector(`[data-item-id="${id}"]`);
    if (!el) return null;
    for (const shape of el.querySelectorAll('rect,circle,ellipse,polygon,path,line')) {
      const r = shape.getBoundingClientRect();
      for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.3], [0.7, 0.7], [0.3, 0.7], [0.7, 0.3]]) {
        const x = r.x + r.width * fx;
        const y = r.y + r.height * fy;
        const hit = document.elementFromPoint(x, y)?.closest('[data-item-id]');
        if (hit?.getAttribute('data-item-id') === id) return { x, y };
      }
    }
    // 記憶挑戰時物品隱形、不可點：回外框中心，由座標判定
    const box = el.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, itemId);
  expect(point, `找不到可點的位置：${itemId}`).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
}

test('首頁：一開始就開放前 FREE_SCENE_COUNT 個場景', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '記憶小鎮' })).toBeVisible();
  for (const s of sceneIndex.slice(0, FREE_SCENE_COUNT)) {
    await expect(page.getByRole('link', { name: new RegExp(s.name) })).toBeVisible();
  }
  // TODO: 場景超過 FREE_SCENE_COUNT 個後，補測第 FREE_SCENE_COUNT+1 個鎖著、點了會提示解鎖條件
});

test('小鎮：所有場景在同一張地圖，點小地圖切換街區', async ({ page }) => {
  await page.goto('/scene/park');
  await page.getByRole('button', { name: '商業街', exact: true }).click();
  await expect(page).toHaveURL(/\/scene\/street$/);
  await expect(page.getByRole('heading', { name: '商業街' })).toBeVisible();

  await page.getByRole('button', { name: /自由探索/ }).click();
  const mailbox = street.items.find((i) => i.id === 'mailbox')!;
  await clickItem(page, 'mailbox', mailbox.zone, street as SceneJson);
  await expect(page.getByRole('status')).toContainText('mailbox');
});

test('小鎮：滾輪縮放；+ / - / 0 快捷鍵不用先點地圖', async ({ page }) => {
  await page.goto('/scene/park');
  const bench = page.locator('[data-item-id="bench"]');
  const width = async () => (await bench.boundingBox())!.width;
  const w0 = await width();

  // 游標放在選關面板外（面板上的滾輪留給面板）
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.move(box.x + box.width - 250, box.y + box.height / 2);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -100);
  await expect.poll(width).toBeGreaterThan(w0 * 1.5);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 100);
  await expect.poll(width).toBeLessThan(w0 * 1.05);

  await page.keyboard.press('0');
  await expect.poll(width).toBeLessThan(w0 * 0.9);
  await page.keyboard.press('+');
  const afterPlus = await width();
  await page.keyboard.press('-');
  await expect.poll(width).toBeLessThan(afterPlus);
});

test('自由探索：點物品顯示英文與中文，切日語顯示假名', async ({ page }) => {
  await page.goto('/scene/park');
  await page.getByRole('button', { name: /自由探索/ }).click();
  const bench = park.items.find((i) => i.id === 'bench')!;
  await clickItem(page, 'bench', bench.zone);
  const popup = page.getByRole('status');
  await expect(popup).toContainText('bench');
  await expect(popup).toContainText('長椅');

  await page.getByRole('radio', { name: '日' }).click();
  const fountain = park.items.find((i) => i.id === 'fountain')!;
  await clickItem(page, 'fountain', fountain.zone);
  await expect(page.getByRole('status')).toContainText('噴水');
  await expect(page.getByRole('status')).toContainText('ふんすい');

  await page.getByRole('radio', { name: '中' }).click();
  await clickItem(page, 'bench', bench.zone);
  await expect(page.getByRole('status')).toContainText('長椅');
  await expect(page.getByRole('status')).toContainText('bench');
  await page.getByRole('radio', { name: 'EN' }).click();

  await page.goto('/vocab');
  await expect(page.getByText('長椅')).toBeVisible();
});

test('看圖找：找齊 10 個 → 3 星', async ({ page }) => {
  await page.goto('/scene/park');
  await page.getByRole('button', { name: /看圖找/ }).click();
  const words = await page.locator('ul[aria-label="要找的物品"] li span[lang="en"]').allTextContents();
  expect(words).toHaveLength(10);
  for (const w of words) {
    const item = itemByEn.get(w)!;
    await clickItem(page, item.id, item.zone);
    await expect(page.getByRole('status')).toContainText('找到了');
  }
  await expect(page.getByText('看圖找 完成')).toBeVisible({ timeout: 5000 });
  await expect(page.getByLabel('3 顆星').first()).toBeVisible();
});

/** 畫面內的一點：mode='gap' → 在某物品外框內、但不在任何形狀上（回傳外框最小的那個物品）；mode='empty' → 離所有物品外框 30px 以上 */
async function findPoint(page: Page, mode: 'gap' | 'empty') {
  const box = (await canvas(page).boundingBox())!;
  return page.evaluate(({ box, mode }) => {
    const rects = [...document.querySelectorAll('[data-item-id]')].map((el) => ({ id: el.getAttribute('data-item-id')!, r: el.getBoundingClientRect() }));
    const inRect = (r: DOMRect, x: number, y: number, pad: number) => x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
    for (let y = box.y + 120; y < box.y + box.height - 120; y += 7) {
      for (let x = box.x + 220; x < box.x + box.width - 120; x += 7) {
        const hit = document.elementFromPoint(x, y);
        if (hit?.closest('[data-item-id],[data-ui],button')) continue;
        const around = rects.filter((c) => inRect(c.r, x, y, mode === 'gap' ? 0 : 30));
        if (mode === 'empty' && around.length === 0) return { x, y, id: null };
        if (mode === 'gap' && around.length > 0) {
          const smallest = around.reduce((a, b) => (a.r.width * a.r.height <= b.r.width * b.r.height ? a : b));
          return { x, y, id: smallest.id };
        }
      }
    }
    return null;
  }, { box, mode });
}

test('點擊判定：點在形狀空隙也算點到；關卡中點背景會提示', async ({ page }) => {
  await page.goto('/scene/park');
  await page.getByRole('button', { name: /自由探索/ }).click();
  const gap = await findPoint(page, 'gap');
  expect(gap, '畫面內找不到形狀空隙').not.toBeNull();
  await page.mouse.click(gap!.x, gap!.y);
  await expect(page.getByRole('status')).toContainText(park.items.find((i) => i.id === gap!.id)!.words.en);

  await page.getByRole('button', { name: '回選關' }).click();
  await page.getByRole('button', { name: /看圖找/ }).click();
  const empty = await findPoint(page, 'empty');
  expect(empty, '畫面內找不到空白處').not.toBeNull();
  await page.mouse.click(empty!.x, empty!.y);
  await expect(page.getByText('這裡沒有物品，再找找看')).toBeVisible();
});

test('縮到看整個小鎮後，地圖還是拉得動；游標是手（拖曳中變抓住）', async ({ page }) => {
  await page.goto('/scene/park');
  await page.getByRole('button', { name: /自由探索/ }).click();
  await page.keyboard.press('0');
  const transform = () => page.locator('[aria-label^="小鎮"] svg > g').first().evaluate((g) => (g as SVGGElement).style.transform);
  await page.waitForTimeout(200);
  const before = await transform();
  const box = (await canvas(page).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cursor = () => canvas(page).evaluate((el) => getComputedStyle(el).cursor);
  expect(await cursor()).toBe('grab');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 150, y, { steps: 8 });
  expect(await cursor()).toBe('grabbing');
  await page.mouse.up();
  expect(await cursor()).toBe('grab');
  await expect.poll(transform).not.toBe(before);
});

test('右鍵狀態卡住（buttons=2）時，左鍵仍然可以拖曳和點物品', async ({ page }) => {
  // 有些滑鼠 / 驅動會讓 Chrome 以為右鍵一直按著：這時按左鍵只有 pointermove（和弦按鍵），沒有 pointerdown / pointerup
  await page.goto('/scene/park');
  await page.getByRole('button', { name: /自由探索/ }).click();
  await page.evaluate(() => window.addEventListener('contextmenu', (e) => e.preventDefault(), true));
  const transform = () => page.locator('[aria-label^="小鎮"] svg > g').first().evaluate((g) => (g as SVGGElement).style.transform);
  const box = (await canvas(page).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  // 右鍵在地圖外（頁首）按下後卡住，再移到地圖上
  await page.mouse.move(x, box.y - 20);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(x, y, { steps: 4 });

  const before = await transform();
  await page.mouse.down();
  await page.mouse.move(x - 250, y - 150, { steps: 8 });
  await page.mouse.up();
  await expect.poll(transform).not.toBe(before);

  const bench = park.items.find((i) => i.id === 'bench')!;
  await clickItem(page, 'bench', bench.zone);
  await expect(page.getByRole('status')).toContainText('bench');
  await page.mouse.up({ button: 'right' });
});

test('選關畫面：面板外可以拖曳地圖', async ({ page }) => {
  await page.goto('/scene/park');
  await expect(page.getByRole('button', { name: /自由探索/ })).toBeVisible();
  const transform = () => page.locator('[aria-label^="小鎮"] svg > g').first().evaluate((g) => (g as SVGGElement).style.transform);
  const before = await transform();
  const box = (await canvas(page).boundingBox())!;
  const x = box.x + box.width - 250;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 300, y - 200, { steps: 8 });
  await page.mouse.up();
  await expect.poll(transform).not.toBe(before);
});

test('選關畫面：點地圖上的物品直接關掉選單、進入自由探索', async ({ page }) => {
  await page.goto('/scene/park');
  await expect(page.getByRole('button', { name: /自由探索/ })).toBeVisible();
  const bench = park.items.find((i) => i.id === 'bench')!;
  await clickItem(page, 'bench', bench.zone);
  await expect(page.getByRole('button', { name: /自由探索/ })).toBeHidden();
  await expect(page.getByRole('status')).toContainText('bench');
});

test('選關畫面：✕ 和 Esc 都能關掉選單', async ({ page }) => {
  await page.goto('/scene/park');
  await page.getByRole('button', { name: '關閉選單' }).click();
  await expect(page.getByRole('button', { name: /自由探索/ })).toBeHidden();
  await page.getByRole('button', { name: '回選關' }).click();
  await expect(page.getByRole('button', { name: /自由探索/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /自由探索/ })).toBeHidden();
});

test('看圖找：點錯物品只顯示單字、不算找到；提示會用掉次數', async ({ page }) => {
  await page.goto('/scene/park');
  await page.getByRole('button', { name: /看圖找/ }).click();
  const words = await page.locator('ul[aria-label="要找的物品"] li span[lang="en"]').allTextContents();
  const other = park.items.find((i) => !words.includes(i.words.en))!;
  await clickItem(page, other.id, other.zone);
  await expect(page.getByRole('status')).toContainText(other.words.en);
  await expect(page.getByRole('status')).not.toContainText('找到了');
  await expect(page.getByText('1. 看圖找 · 0 / 10')).toBeVisible();

  await page.getByRole('button', { name: /^3$/ }).click();
  await expect(page.getByText(/提示：在「/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^2$/ })).toBeVisible();
});

test('記憶挑戰：物品隱形，點在原位置才算找到；點錯三次會揭曉', async ({ page }) => {
  await unlockAll(page);
  await page.goto('/scene/park');
  await page.getByRole('button', { name: /記憶挑戰/ }).click();
  await expect(page.locator('.scene-item--hidden')).toHaveCount(park.items.length);
  await expect(page.getByRole('button', { name: /^10$/ })).toBeVisible();

  // 第一個目標：點畫面上離它很遠的地方三次 → 揭曉
  const first = itemByEn.get((await page.locator('footer span[lang="en"]').first().textContent())!.trim())!;
  const box = (await canvas(page).boundingBox())!;
  const target = (await page.locator(`[data-item-id="${first.id}"]`).boundingBox())!;
  const farX = target.x + target.width / 2 < box.x + box.width / 2 ? box.x + box.width - 200 : box.x + 260;
  for (let i = 0; i < 3; i++) await page.mouse.click(farX, box.y + box.height / 2);
  await expect(page.getByText('在這裡！記住它的位置')).toBeVisible();
  await page.waitForTimeout(2600);

  // 第二個目標：點在它原本的位置
  const word = await page.locator('footer span[lang="en"]').first().textContent();
  const item = itemByEn.get(word!.trim())!;
  await clickItem(page, item.id, item.zone);
  await expect(page.getByRole('status')).toContainText('找到了');
  await expect(page.getByText('4. 記憶挑戰 · 2 / 10')).toBeVisible();
});
