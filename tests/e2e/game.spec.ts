import { expect, test, type Page } from '@playwright/test';
import park from '../../src/data/scenes/park.json';
import street from '../../src/data/scenes/street.json';

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

test('首頁：四個場景，只有公園開放', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '記憶小鎮' })).toBeVisible();
  await expect(page.getByRole('link', { name: /公園/ })).toBeVisible();
  await expect(page.getByText('完成「公園」的看圖找後解鎖')).toBeVisible();
  await expect(page.getByRole('link', { name: /商業街/ })).toHaveCount(0);
});

test('小鎮：所有場景在同一張地圖，點小地圖切換街區；未解鎖的街區會提示', async ({ page }) => {
  await page.goto('/scene/park');
  await page.getByRole('button', { name: '商業街', exact: true }).click();
  await expect(page.getByText('「商業街」還沒解鎖：先完成「公園」的看圖找')).toBeVisible();

  await unlockAll(page);
  await page.goto('/scene/park');
  await page.getByRole('button', { name: '商業街', exact: true }).click();
  await expect(page).toHaveURL(/\/scene\/street$/);
  await expect(page.getByRole('heading', { name: '商業街' })).toBeVisible();

  await page.getByRole('button', { name: /自由探索/ }).click();
  const mailbox = street.items.find((i) => i.id === 'mailbox')!;
  await clickItem(page, 'mailbox', mailbox.zone, street as SceneJson);
  await expect(page.getByRole('status')).toContainText('mailbox');
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

  await page.goto('/vocab');
  await expect(page.getByText('長椅')).toBeVisible();
});

test('看圖找：找齊 5 個 → 3 星，並解鎖下一個場景', async ({ page }) => {
  await page.goto('/scene/park');
  await page.getByRole('button', { name: /看圖找/ }).click();
  const words = await page.locator('ul[aria-label="要找的物品"] li span[lang="en"]').allTextContents();
  expect(words).toHaveLength(5);
  for (const w of words) {
    const item = itemByEn.get(w)!;
    await clickItem(page, item.id, item.zone);
    await expect(page.getByRole('status')).toContainText('找到了');
  }
  await expect(page.getByText('看圖找 完成')).toBeVisible({ timeout: 5000 });
  await expect(page.getByLabel('3 顆星').first()).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('link', { name: /商業街/ })).toBeVisible();
});

test('看圖找：點錯物品只顯示單字、不算找到；提示會用掉次數', async ({ page }) => {
  await page.goto('/scene/park');
  await page.getByRole('button', { name: /看圖找/ }).click();
  const words = await page.locator('ul[aria-label="要找的物品"] li span[lang="en"]').allTextContents();
  const other = park.items.find((i) => !words.includes(i.words.en))!;
  await clickItem(page, other.id, other.zone);
  await expect(page.getByRole('status')).toContainText(other.words.en);
  await expect(page.getByRole('status')).not.toContainText('找到了');
  await expect(page.getByText('1. 看圖找 · 0 / 5')).toBeVisible();

  await page.getByRole('button', { name: /^3$/ }).click();
  await expect(page.getByText(/提示：在「/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^2$/ })).toBeVisible();
});

test('記憶挑戰：物品隱形，點在原位置才算找到；點錯三次會揭曉', async ({ page }) => {
  await unlockAll(page);
  await page.goto('/scene/park');
  await page.getByRole('button', { name: /記憶挑戰/ }).click();
  await expect(page.locator('.scene-item--hidden')).toHaveCount(park.items.length);

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
