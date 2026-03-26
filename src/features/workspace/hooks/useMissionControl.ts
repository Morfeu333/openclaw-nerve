/**
 * useMissionControl — Fetches agent sessions and cron jobs for the Mission Control tab.
 * Auto-refreshes every 30 seconds.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { type CronJob, normalizeCronJob } from './useCrons';

export interface AgentSession {
  key: string;
  agent: string;
  sessionId?: string;
  channel: string;
  updatedAt: number;
  totalTokens: number;
  percentUsed: number;
}

export interface AgentSummary {
  agent: string;
  latestSession?: AgentSession;
  /** 'active' = updated in last 2h, 'today' = updated today, 'idle' = older */
  status: 'active' | 'today' | 'idle';
}

const REFRESH_INTERVAL_MS = 30_000;

export function useMissionControl() {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessRes, cronsRes] = await Promise.all([
        fetch('/api/sessions/list'),
        fetch('/api/crons'),
      ]);

      const sessData = await sessRes.json() as { ok: boolean; sessions?: AgentSession[]; error?: string };
      if (sessData.ok && sessData.sessions) {
        setSessions(sessData.sessions);
      }

      const cronsData = await cronsRes.json() as {
        ok: boolean;
        result?: { jobs?: unknown[]; details?: { jobs?: unknown[] } };
        error?: string;
      };
      if (cronsData.ok) {
        const raw = cronsData.result?.jobs || cronsData.result?.details?.jobs || (Array.isArray(cronsData.result) ? cronsData.result : []);
        setCronJobs((raw as Record<string, unknown>[]).map(normalizeCronJob));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchData]);

  /** Per-agent summary: most recent session + activity status */
  const agentSummaries: AgentSummary[] = ['main', 'scraper', 'project-manager', 'sdr'].map(agent => {
    const agentSessions = sessions.filter(s => s.agent === agent);
    const latest = agentSessions.length > 0
      ? agentSessions.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b))
      : undefined;

    const now = Date.now();
    const twoHoursAgo = now - 2 * 60 * 60 * 1000;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    let status: AgentSummary['status'] = 'idle';
    if (latest) {
      if (latest.updatedAt >= twoHoursAgo) status = 'active';
      else if (latest.updatedAt >= startOfToday.getTime()) status = 'today';
    }

    return { agent, latestSession: latest, status };
  });

  const activeCronCount = cronJobs.filter(j => j.enabled).length;

  return { sessions, cronJobs, agentSummaries, activeCronCount, loading, error, refresh: fetchData };
}
