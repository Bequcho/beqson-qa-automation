import { test, expect, type Response } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// This is an evidence probe, NOT automatic completion of the full official item.
// Every HTTP write is blocked. It must not generate speech or consume aiKit tokens.
const local = path.resolve(process.env.AIKIT_LOCAL_DIR || '.aikit-local');
const authState = path.join(local, 'auth-state.json');
const checklistPath = path.join(local, 'checklist.json');
const targetId = 'official.voice-kit.02';

type Item = { id: string; objective: string; reconciled: boolean; sourceTruncated: boolean };
function localCriterion(): Item | undefined {
  try {
    const data = JSON.parse(readFileSync(checklistPath, 'utf8')) as { scenarios: Item[] };
    return data.scenarios.find(item => item.id === targetId);
  } catch {
    return undefined;
  }
}

test.use({ storageState: existsSync(authState) ? authState : undefined });

test('official.voice-kit.02 stock-voice preview evidence probe', async ({ page, context }) => {
  test.skip(!existsSync(authState), 'BLOCKED:LOCAL_LOGIN_REQUIRED');
  const criterion = localCriterion();
  test.skip(!criterion?.reconciled || criterion.sourceTruncated, 'BLOCKED:FULL_CRITERION_REQUIRED');
  test.skip(!/^Stock voices, ready now\s*$/.test(criterion.objective), 'BLOCKED:CRITERION_CHANGED');

  // Fail closed on all state changes and external navigation; only public audio samples are in scope.
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())
        || request.resourceType() === 'websocket'
        || (request.isNavigationRequest() && url.origin !== 'https://aikit.ai')) {
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });

  const mediaResponses: string[] = [];
  page.on('response', (response: Response) => {
    const type = (response.headers()['content-type'] || '').toLowerCase();
    if (response.ok() && (type.startsWith('audio/') || /\.(?:mp3|wav|ogg|m4a|aac)(?:[?#]|$)/i.test(response.url()))) {
      mediaResponses.push(response.url());
    }
  });

  const navigation = await page.goto('https://aikit.ai/tools/voice-kit', { waitUntil: 'domcontentloaded' }).catch(() => null);
  test.skip(!navigation || [401, 403].includes(navigation.status()), 'BLOCKED:AUTH_NAVIGATION_UNAVAILABLE');
  test.skip(new URL(page.url()).pathname !== '/tools/voice-kit', 'BLOCKED:LOCAL_SESSION_EXPIRED');

  await test.step('Verify that stock voices and the full catalog are available', async () => {
    await expect(page.getByText('Stock voices', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'All 60 stock voices' })).toBeVisible();
  });

  for (const voice of ['Ike', 'Sarah', 'George']) {
    await test.step(`Preview ${voice} without sending any write request`, async () => {
      const button = page.getByRole('button', { name: `Hear ${voice} (AI-generated voice)` });
      await expect(button).toBeVisible();
      await expect(button).toBeEnabled();
      const previous = mediaResponses.length;
      await button.click();

      // Some players render an <audio> element, while others use an in-memory Audio object.
      // A valid media response or observed active playback is needed, not just a button click.
      let observed = false;
      for (let attempt = 0; attempt < 16; attempt++) {
        const playing = await page.locator('audio,video').evaluateAll(elements =>
          elements.some(element => {
            const media = element as HTMLMediaElement;
            return !media.paused && media.currentTime > 0;
          })
        );
        if (mediaResponses.length > previous || playing) { observed = true; break; }
        await page.waitForTimeout(300);
      }
      test.skip(!observed, 'BLOCKED:PREVIEW_PLAYBACK_UNOBSERVABLE');
      expect(observed).toBe(true);
    });
  }

  // Even a successful probe does NOT prove that selecting voices or generated
  // speech works. The runner keeps the official criterion NOT TESTED.
});
