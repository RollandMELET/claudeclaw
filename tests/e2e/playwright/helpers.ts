/**
 * Playwright page-object helpers for War Room v2 e2e tests.
 *
 * Slice 0 — scaffold only. Methods throw until the corresponding slice is
 * implemented (see comments below).
 */

import { Page, expect } from '@playwright/test';

export interface WarRoomPageOptions {
  /** Dev dashboard port (defaults to 3142). */
  port?: number;
  /** Dashboard auth token injected into URL query. */
  token: string;
}

export class WarRoomPage {
  constructor(public readonly page: Page, public readonly opts: WarRoomPageOptions) {}

  /** Navigate to the War Room and dismiss the cinematic intro. */
  async goto(): Promise<void> {
    const port = this.opts.port ?? 3142;
    await this.page.goto(`http://localhost:${port}/warroom?token=${this.opts.token}`);
    // Dismiss "Click to enter" overlay (autoplay policy workaround)
    const overlay = this.page.locator('text="Click to enter"');
    if (await overlay.count()) await overlay.click();
  }

  /** Pin a specific agent by its id (e.g. 'main', 'rc2', 'ops', 'rorworld-warroom'). */
  async pinAgent(_agentId: string): Promise<void> {
    throw new Error('pinAgent() implemented in Slice 1.');
  }

  /** Start a meeting (after an agent is pinned). */
  async startMeeting(): Promise<void> {
    throw new Error('startMeeting() implemented in Slice 1.');
  }

  /** End the current meeting. */
  async endMeeting(): Promise<void> {
    throw new Error('endMeeting() implemented in Slice 1.');
  }

  /** Type text in the hybrid text-input bar and submit. */
  async sendText(_text: string): Promise<void> {
    throw new Error('sendText() implemented in Slice 4.');
  }

  /** Return all rendered transcript entries with their resolved speaker labels. */
  async getTranscriptEntries(): Promise<Array<{ speaker: string; text: string }>> {
    throw new Error('getTranscriptEntries() implemented in Slice 1.');
  }

  /** Open the past-meetings archive view. */
  async openArchive(): Promise<void> {
    throw new Error('openArchive() implemented in Slice 3.');
  }

  /** Click Resume on a specific past meeting by id. */
  async resumeMeeting(_meetingId: string): Promise<void> {
    throw new Error('resumeMeeting() implemented in Slice 6.');
  }
}

/** Expect the transcript has N entries and at least one is labelled `speakerLabel`. */
export async function expectTranscriptContains(
  wr: WarRoomPage,
  speakerLabel: string,
): Promise<void> {
  const entries = await wr.getTranscriptEntries();
  expect(entries.some((e) => e.speaker === speakerLabel)).toBe(true);
}
