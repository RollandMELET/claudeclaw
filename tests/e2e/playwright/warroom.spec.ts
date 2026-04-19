/**
 * War Room v2 — smoke spec (Slice 0 baseline).
 *
 * This spec intentionally does NOT require the dev dashboard to be running.
 * It validates that the Playwright harness is wired up correctly: the helper
 * classes import, Playwright loads, configuration is read.
 *
 * Real user-flow specs arrive in Slices 1-8 and each is gated by its own
 * harness prerequisite (dashboard on 3142, DB resettable, etc.).
 */

import { test, expect } from '@playwright/test';
import { WarRoomPage } from './helpers';

test.describe('Slice 0 — e2e harness baseline', () => {
  test('WarRoomPage helper can be instantiated with options', async ({ page }) => {
    const wr = new WarRoomPage(page, { port: 3142, token: 'dummy' });
    expect(wr.opts.port).toBe(3142);
    expect(wr.opts.token).toBe('dummy');
  });

  test('unimplemented helpers throw explicit Slice references', async ({ page }) => {
    const wr = new WarRoomPage(page, { port: 3142, token: 'dummy' });
    await expect(wr.startMeeting()).rejects.toThrow(/Slice 1/);
    await expect(wr.sendText('hi')).rejects.toThrow(/Slice 4/);
    await expect(wr.resumeMeeting('m-1')).rejects.toThrow(/Slice 6/);
  });
});
