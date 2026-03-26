import fs from 'fs';
import path from 'path';
import os from 'os';

import { logger } from './logger.js';
import { readEnvFile } from './env.js';

type Sender = (text: string) => Promise<void>;

const CREDENTIALS_PATH = path.join(os.homedir(), '.claude', '.credentials.json');

/** How often to check (30 minutes) */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

/** Alert when token expires within this window */
const ALERT_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Don't spam - track last alert level to avoid repeating */
let lastAlertLevel: 'none' | 'warning' | 'expired' = 'none';

interface Credentials {
  claudeAiOauth?: {
    expiresAt?: number;
    subscriptionType?: string;
  };
}

function readCredentials(): Credentials | null {
  try {
    const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}

async function checkOAuthHealth(sender: Sender): Promise<void> {
  // If a long-lived setup token is configured in .env, the credentials file is irrelevant
  const env = readEnvFile(['CLAUDE_CODE_OAUTH_TOKEN']);
  if (env.CLAUDE_CODE_OAUTH_TOKEN) {
    logger.debug('Using long-lived env token (CLAUDE_CODE_OAUTH_TOKEN), skipping credentials check');
    lastAlertLevel = 'none';
    return;
  }

  const creds = readCredentials();

  if (!creds?.claudeAiOauth?.expiresAt) {
    if (lastAlertLevel !== 'expired') {
      lastAlertLevel = 'expired';
      await sender(
        '<b>OAuth Health Check</b>\n\n' +
        'Impossible de lire le token OAuth.\n' +
        'Fichier manquant ou structure invalide.\n\n' +
        '<code>claude auth login --email rm@360sc.io</code>',
      );
    }
    return;
  }

  const expiresAt = creds.claudeAiOauth.expiresAt;
  const now = Date.now();
  const remainingMs = expiresAt - now;
  const remainingHours = Math.floor(remainingMs / (60 * 60 * 1000));
  const remainingMinutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

  if (remainingMs <= 0) {
    // Token expired
    if (lastAlertLevel !== 'expired') {
      lastAlertLevel = 'expired';
      logger.error({ expiresAt, remainingMs }, 'OAuth token EXPIRED');
      await sender(
        '<b>OAuth Health Check - TOKEN EXPIRE</b>\n\n' +
        `Le token OAuth a expire il y a ${Math.abs(remainingMinutes)} minutes.\n` +
        'RC1/RC2 vont crasher au prochain appel API.\n\n' +
        '<b>Action requise :</b>\n' +
        '<code>ssh macmini "claude auth logout && claude auth login --email rm@360sc.io"</code>',
      );
    }
  } else if (remainingMs <= ALERT_THRESHOLD_MS) {
    // Token expiring soon
    if (lastAlertLevel !== 'warning') {
      lastAlertLevel = 'warning';
      logger.warn({ expiresAt, remainingHours, remainingMinutes }, 'OAuth token expiring soon');
      await sender(
        '<b>OAuth Health Check - Expiration proche</b>\n\n' +
        `Le token OAuth expire dans <b>${remainingHours}h${remainingMinutes}min</b>.\n\n` +
        '<b>Action recommandee :</b>\n' +
        '<code>ssh macmini "claude auth logout && claude auth login --email rm@360sc.io"</code>',
      );
    }
  } else {
    // Token healthy - reset alert state
    if (lastAlertLevel !== 'none') {
      lastAlertLevel = 'none';
      logger.info({ remainingHours }, 'OAuth token healthy again');
    }
    logger.debug({ remainingHours, remainingMinutes }, 'OAuth token OK');
  }
}

/**
 * Start periodic OAuth health checks.
 * Checks immediately on init, then every 30 minutes.
 */
export function initOAuthHealthCheck(sender: Sender): void {
  // Initial check after 10s (let bot fully start)
  setTimeout(() => void checkOAuthHealth(sender), 10_000);

  // Periodic checks
  setInterval(() => void checkOAuthHealth(sender), CHECK_INTERVAL_MS);

  logger.info(
    { intervalMin: CHECK_INTERVAL_MS / 60_000, alertThresholdHours: ALERT_THRESHOLD_MS / (60 * 60 * 1000) },
    'OAuth health check initialized',
  );
}
