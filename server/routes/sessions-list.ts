// GET /api/sessions/list
// Reads session summaries for main, scraper, project-manager, sdr agents
// directly from disk. No WebSocket or gateway auth needed.

import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { rateLimitGeneral } from '../middleware/rate-limit.js';

const app = new Hono();

const KNOWN_AGENTS = ['main', 'scraper', 'project-manager', 'sdr'];

async function readSessionsForAgent(agent: string) {
  const storeFile = join(homedir(), '.openclaw', 'agents', agent, 'sessions', 'sessions.json');
  if (!existsSync(storeFile)) return [];

  let raw: string;
  try {
    raw = await readFile(storeFile, 'utf8');
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

async function readCronsFromDisk() {
  const cronFile = join(homedir(), '.openclaw', 'cron', 'jobs.json');
  if (!existsSync(cronFile)) return [];
  let raw: string;
  try { raw = await readFile(cronFile, 'utf8'); } catch { return []; }
  let store: Record<string, unknown>;
  try { store = JSON.parse(raw) as Record<string, unknown>; } catch { return []; }
  const jobs = (store.jobs as Record<string, unknown>[] | undefined) || [];
  return jobs.map((j) => {
    const sched = (j.schedule || {}) as Record<string, unknown>;
    const payload = (j.payload || {}) as Record<string, unknown>;
    const state = (j.state || {}) as Record<string, unknown>;
    return {
      id: (j.id || j.jobId || '') as string,
      name: (j.name || j.label || '') as string,
      enabled: (j.enabled as boolean) ?? true,
      scheduleKind: ((sched.kind as string) || (sched.everyMs ? 'every' : sched.expr ? 'cron' : 'every')) as string,
      schedule: sched.expr as string | undefined,
      everyMs: sched.everyMs as number | undefined,
      payloadKind: ((payload.kind as string) === 'systemEvent' ? 'systemEvent' : 'agentTurn') as string,
      model: payload.model as string | undefined,
      nextRun: state.nextRunAtMs ? new Date(state.nextRunAtMs as number).toISOString() : undefined,
      lastRun: state.lastRunAtMs ? new Date(state.lastRunAtMs as number).toISOString() : undefined,
      lastStatus: state.lastStatus as string | undefined,
      lastError: state.lastError as string | undefined,
    };
  });
}

app.get('/api/sessions/list', rateLimitGeneral, async (c) => {
  const all = [];
  for (const agent of KNOWN_AGENTS) {
    const sessions = await readSessionsForAgent(agent);
    all.push(...sessions);
  }
  all.sort((a, b) => b.updatedAt - a.updatedAt);
  return c.json({ ok: true, sessions: all });
});

app.get('/api/crons/local', rateLimitGeneral, async (c) => {
  const jobs = await readCronsFromDisk();
  return c.json({ ok: true, jobs });
});

export default app;
