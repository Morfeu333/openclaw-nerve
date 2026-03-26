/**
 * Sessions List API Route
 *
 * GET /api/sessions/list — Read session summaries for all known agents
 *                          directly from ~/.openclaw/agents/*/sessions/sessions.json
 *
 * This endpoint reads disk files (no WebSocket needed) so it works
 * regardless of gateway connection state. Used by MissionControlTab.
 */

import { Hono } from 'hono';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { rateLimitGeneral } from '../middleware/rate-limit.js';

const app = new Hono();

const KNOWN_AGENTS = ['main', 'scraper', 'project-manager', 'sdr'];

export interface SessionSummary {
  key: string;
  agent: string;
  sessionId?: string;
  channel: string;
  updatedAt: number;
  totalTokens: number;
  percentUsed: number;
}

async function readSessionsForAgent(agent: string): Promise<SessionSummary[]> {
  const storeFile = join(homedir(), '.openclaw', 'agents', agent, 'sessions', 'sessions.json');
  if (!existsSync(storeFile)) return [];

  let raw: string;
  try {
    raw = await fs.readFile(storeFile, 'utf8');
  } catch {
    return [];
  }

  let store: Record<string, Record<string, unknown>>;
  try {
    store = JSON.parse(raw) as Record<string, Record<string, unknown>>;
  } catch {
    return [];
  }

  return Object.entries(store).map(([key, val]) => ({
    key,
    agent,
    sessionId: val.sessionId as string | undefined,
    channel:
      (val.lastChannel as string | undefined) ||
      ((val.deliveryContext as Record<string, unknown> | undefined)?.channel as string | undefined) ||
      'unknown',
    updatedAt: (val.updatedAt as number | undefined) || (val.createdAt as number | undefined) || 0,
    totalTokens: (val.totalTokens as number | undefined) || 0,
    percentUsed: (val.percentUsed as number | undefined) || 0,
  }));
}

app.get('/api/sessions/list', rateLimitGeneral, async (c) => {
  const all: SessionSummary[] = [];
  for (const agent of KNOWN_AGENTS) {
    const sessions = await readSessionsForAgent(agent);
    all.push(...sessions);
  }
  all.sort((a, b) => b.updatedAt - a.updatedAt);
  return c.json({ ok: true, sessions: all });
});

export default app;
