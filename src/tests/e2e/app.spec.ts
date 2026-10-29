import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function openApp(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.globe-canvas, #canvas-fallback:not(.hidden)')).toHaveCount(1);
  await expect(page.locator('.stage-badges')).toContainText('개념 모델');
}

test.describe('TerraShift classroom app', () => {
  test('loads the explore screen with the concept-model disclosure', async ({ page }) => {
    await openApp(page);
    await expect(page).toHaveTitle(/TerraShift/);
    await expect(page.locator('#time-label')).toContainText('현재');
    await expect(page.locator('.badge-concept').first()).toContainText('예보 아님');
    await expect(page.locator('#selection-panel')).toContainText('수렴 경계');
    expect(
      await page.evaluate(() =>
        (
          window as unknown as { __TERRASHIFT__?: { getBoundaryCount: () => number } }
        ).__TERRASHIFT__?.getBoundaryCount()
      )
    ).toBeGreaterThan(10);
  });

  test('scrubbing the timeline updates the model time and readout', async ({ page }) => {
    await openApp(page);
    await page.locator('#time-range').fill('100');
    await page.locator('#time-range').dispatchEvent('input');
    await expect(page.locator('#time-label')).toContainText('100');
    await expect(page.locator('#time-label')).not.toContainText('현재');
    const state = await page.evaluate(() =>
      (
        window as unknown as {
          __TERRASHIFT__?: { getState: () => { time: { myr: number; playing: boolean } } };
        }
      ).__TERRASHIFT__?.getState()
    );
    expect(state?.time.myr).toBe(100);
    expect(state?.time.playing).toBe(false);
    await expect(page.locator('#readout')).toContainText('Myr');
  });

  test('selects boundaries with the keyboard and opens the concept cross-section', async ({
    page
  }) => {
    await openApp(page);
    const before = await page.locator('#readout').textContent();
    await page.keyboard.press(']');
    const after = await page.locator('#readout').textContent();
    expect(after).not.toBe(before);
    await page.keyboard.press('2');
    await expect(page.locator('#cross-section-full')).toBeVisible();
    await expect(page.locator('#full-section-title')).toContainText('경계');
    await expect(page.locator('#full-section-canvas')).toBeVisible();
    await expect(page.locator('#cross-section-full')).toContainText('개념 단면도');
    await page.keyboard.press('Escape');
    await expect(page.locator('#globe-area')).toBeVisible();
  });

  test('completes the boundary mission and persists progress after reload', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: '미션', exact: true }).click();
    await page.locator('[data-mission-id="boundary-id"]').click();
    await expect(page.locator('#mission-panel')).toContainText('관찰 모드');
    await expect(page.locator('#mission-panel')).toContainText('경계를 읽어라');
    await page.locator('input[name="prediction"][value="수렴 경계"]').check();
    await page.locator('[data-action="submit-prediction"]').click();
    await expect(page.locator('#explanation-heading')).toBeVisible();
    await expect(page.locator('#mission-panel')).toContainText('예측 성공');
    await page.locator('input[name="explanation"][value^="해양판이 대륙 아래로 섭입하며"]').check();
    await page.locator('[data-action="submit-explanation"]').click();
    await expect(page.locator('#mission-panel')).toContainText('미션 완료');
    await expect(page.locator('#mission-panel')).toContainText('한 줄 정리');
    await expect(page.locator('#progress-chip')).toContainText('1/6');
    await page.reload();
    await expect(page.locator('#progress-chip')).toContainText('1/6');
    const completed = await page.evaluate(
      () =>
        (
          window as unknown as {
            __TERRASHIFT__?: { getState: () => { mission: { completed: string[] } } };
          }
        ).__TERRASHIFT__?.getState().mission.completed
    );
    expect(completed).toContain('boundary-id');
  });

  test('shows the hidden-type observation mode before the prediction', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: '미션', exact: true }).click();
    await page.locator('[data-mission-id="boundary-id"]').click();
    await expect(page.locator('#readout')).toContainText('경계 유형 관찰 중');
    await expect(page.locator('#layer-list')).toContainText(
      '미션 예측 전에는 경계선과 이름표가 숨겨집니다'
    );
    const boundaryVisible = await page.evaluate(
      () =>
        (
          window as unknown as {
            __TERRASHIFT__?: {
              getState: () => { layers: { boundaries: boolean; labels: boolean } };
            };
          }
        ).__TERRASHIFT__?.getState().layers.boundaries
    );
    expect(boundaryVisible).toBe(true);
  });

  test('resets student progress from teacher mode', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: '미션', exact: true }).click();
    await page.locator('[data-mission-id="rift"]').click();
    await page
      .locator('input[name="prediction"][value="열곡이 넓어지고 낮아져 바다가 될 수 있다"]')
      .check();
    await page.locator('[data-action="submit-prediction"]').click();
    await page
      .locator('input[name="explanation"][value="지각이 갈라지고 가라앉아 물이 들어온다"]')
      .check();
    await page.locator('[data-action="submit-explanation"]').click();
    await expect(page.locator('#progress-chip')).toContainText('1/6');
    await page.getByRole('button', { name: '교사', exact: true }).click();
    await page.locator('#teacher-reset').click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.locator('[data-modal-confirm]').click();
    await expect(page.locator('#progress-chip')).toContainText('0/6');
    const completed = await page.evaluate(
      () =>
        (
          window as unknown as {
            __TERRASHIFT__?: { getState: () => { mission: { completed: string[] } } };
          }
        ).__TERRASHIFT__?.getState().mission.completed
    );
    expect(completed).toEqual([]);
  });

  test('renders the printable worksheet in print media', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: '교사', exact: true }).click();
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#print-worksheet')).toBeVisible();
    await expect(page.locator('#print-worksheet h1')).toContainText('활동지');
    await expect(page.locator('#print-worksheet svg.print-map')).toBeVisible();
    await expect(page.locator('#print-worksheet table')).toBeVisible();
    await page.emulateMedia({ media: 'screen' });
  });

  test('opens the layer and selection sheets on a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page);
    await expect(page.locator('#mobile-tabs')).toBeVisible();
    await page.locator('[data-mobile-tab="layers"]').click();
    await expect(page.locator('#left-panel')).toHaveClass(/open/);
    await expect(page.locator('#left-panel')).toBeVisible();
    await page.locator('[data-mobile-tab="selection"]').click();
    await expect(page.locator('#right-panel')).toHaveClass(/open/);
    await expect(page.locator('#right-panel')).toBeVisible();
    await expect(page.locator('#left-panel')).not.toHaveClass(/open/);
    await page.locator('[data-mobile-tab="selection"]').click();
    await expect(page.locator('#right-panel')).not.toHaveClass(/open/);
  });

  test('does not make external API calls after load', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith('http://127.0.0.1:4173') && !url.startsWith('http://localhost:4173')) {
        external.push(url);
      }
    });
    await openApp(page);
    await page.waitForTimeout(500);
    expect(external).toEqual([]);
  });

  test('has no serious accessibility violations on explore and mission screens', async ({
    page
  }) => {
    await openApp(page);
    const explore = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = explore.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious'
    );
    expect(serious.map((violation) => violation.id)).toEqual([]);
    await page.getByRole('button', { name: '미션', exact: true }).click();
    await page.locator('[data-mission-id="boundary-id"]').click();
    const mission = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const missionSerious = mission.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious'
    );
    expect(missionSerious.map((violation) => violation.id)).toEqual([]);
  });
});

const ALL_MISSIONS = [
  {
    id: 'boundary-id',
    answer: '수렴 경계',
    explanation: '해양판이 대륙 아래로 섭입하며 마그마가 만들어지기 때문'
  },
  {
    id: 'continental-collision',
    answer: '넓고 높은 산맥과 두꺼워진 지각',
    explanation: '대륙 지각이 밀려 올라가고 두꺼워지기 때문'
  },
  {
    id: 'ocean-continent',
    answer: '해구 → 산맥 → 화산호',
    explanation: '섭입하는 판의 깊이에 따라 마그마가 만들어지는 위치가 달라지기 때문'
  },
  {
    id: 'transform',
    answer: '지진은 많지만 화산은 거의 없다',
    explanation: '지각이 수평으로 미끄러질 뿐, 마그마가 올라오는 틈이 잘 생기지 않기 때문'
  },
  {
    id: 'rift',
    answer: '열곡이 넓어지고 낮아져 바다가 될 수 있다',
    explanation: '지각이 갈라지고 가라앉아 물이 들어온다'
  },
  {
    id: 'ring-of-fire',
    answer: '태평양판이 주변 판과 만드는 수렴 경계를 따라 섭입과 화산 활동이 일어나기 때문',
    explanation: '여러 판이 만나는 수렴 경계가 이어지기 때문'
  }
];

test('completes all six missions from a fresh state', async ({ page }) => {
  test.setTimeout(90_000);
  await openApp(page);
  await page.getByRole('button', { name: '미션', exact: true }).click();
  for (let index = 0; index < ALL_MISSIONS.length; index += 1) {
    const mission = ALL_MISSIONS[index];
    await page.locator('#mission-select').selectOption(mission.id);
    await page.locator(`input[name="prediction"][value="${mission.answer}"]`).check();
    await page.locator('[data-action="submit-prediction"]').click();
    await expect(page.locator('#explanation-heading')).toBeVisible();
    await page.locator(`input[name="explanation"][value="${mission.explanation}"]`).check();
    await page.locator('[data-action="submit-explanation"]').click();
    await expect(page.locator('#mission-panel')).toContainText('미션 완료');
    await expect(page.locator('#progress-chip')).toContainText(`${index + 1}/6`);
  }
  const completed = await page.evaluate(
    () =>
      (
        window as unknown as {
          __TERRASHIFT__?: { getState: () => { mission: { completed: string[] } } };
        }
      ).__TERRASHIFT__?.getState().mission.completed
  );
  expect(completed).toHaveLength(6);
});

test('respects reduced-motion preferences and the teacher toggle', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page);
  await expect(page.locator('body')).toHaveClass(/reduced-motion/);
  const motion = await page.evaluate(
    () =>
      (
        window as unknown as {
          __TERRASHIFT__?: { getState: () => { preferences: { reducedMotion: boolean } } };
        }
      ).__TERRASHIFT__?.getState().preferences.reducedMotion
  );
  expect(motion).toBe(true);
  await page.getByRole('button', { name: '교사', exact: true }).click();
  await expect(page.locator('input[data-pref="reducedMotion"]')).toBeChecked();
  const motionToggle = page
    .locator('label.toggle')
    .filter({ has: page.locator('input[data-pref="reducedMotion"]') });
  await motionToggle.click();
  await expect(page.locator('body')).not.toHaveClass(/reduced-motion/);
});

test('completes the boundary mission with keyboard activation', async ({ page }) => {
  await openApp(page);
  await page.locator('[data-route="missions"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-mission-id="boundary-id"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('input[name="prediction"]').first().focus();
  await page.keyboard.press('ArrowDown');
  await page.locator('[data-action="submit-prediction"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#explanation-heading')).toBeVisible();
  await page.locator('input[name="explanation"]').first().focus();
  await page.keyboard.press('Space');
  await page.locator('[data-action="submit-explanation"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#mission-panel')).toContainText('미션 완료');
});
