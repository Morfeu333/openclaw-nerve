/**
 * MissionControlTab — Mini-dashboard for OpenClaw pipeline health.
 *
 * Three sections:
 *  A. Agent Status  — latest session per agent + activity indicator
 *  B. Cron Health   — cron jobs with next/last run times
 *  C. Quick Stats   — numeric summary cards
 */

import { RefreshCw, Activity, Clock, Users, LayoutDashboard, Circle } from 'lucide-react';
import { useMissionControl } from '../hooks/useMissionControl';

/** Format a timestamp as a relative string ("2h atrás", "em 23 min", etc.) */
function relative(ms: number, future = false): string {
  const diff = future ? ms - Date.now() : Date.now() - ms;
  if (diff < 0) return future ? 'agora' : 'agora';
  const secs = Math.floor(diff / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (future) {
    if (secs < 60) return `em ${secs}s`;
    if (mins < 60) return `em ${mins} min`;
    if (hours < 24) return `em ${hours}h ${mins % 60}min`;
    return `em ${days}d`;
  }
  if (secs < 60) return `${secs}s atrás`;
  if (mins < 60) return `${mins} min atrás`;
  if (hours < 24) return `${hours}h atrás`;
  return `${days}d atrás`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

const AGENT_LABELS: Record<string, string> = {
  main: 'Main',
  scraper: 'Scraper',
  'project-manager': 'PM',
  sdr: 'SDR',
};

const STATUS_COLOR: Record<string, string> = {
  active: 'text-green-400',
  today: 'text-yellow-400',
  idle: 'text-muted-foreground/40',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'ativo',
  today: 'hoje',
  idle: 'inativo',
};

export function MissionControlTab() {
  const { agentSummaries, cronJobs, sessions, activeCronCount, loading, error, refresh } = useMissionControl();

  return (
    <div className="h-full overflow-y-auto p-2 flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-[0.667rem] uppercase tracking-wider text-muted-foreground">
          <LayoutDashboard size={10} />
          <span>Mission Control</span>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="text-[0.667rem] text-red-400 px-1">{error}</div>
      )}

      {/* Section A — Agent Status */}
      <section className="rounded-md border border-border/40 bg-background/30 p-3">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Activity size={11} className="text-muted-foreground" />
          <span className="text-[0.667rem] font-semibold uppercase tracking-wider text-muted-foreground">Agent Status</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {agentSummaries.map(({ agent, latestSession, status }) => (
            <div key={agent} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Circle size={6} className={`shrink-0 fill-current ${STATUS_COLOR[status]}`} />
                <span className="text-xs font-medium truncate">{AGENT_LABELS[agent] ?? agent}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 text-[0.667rem] text-muted-foreground">
                {latestSession ? (
                  <>
                    <span className={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</span>
                    <span>{relative(latestSession.updatedAt)}</span>
                    {latestSession.totalTokens > 0 && (
                      <span title={`${latestSession.percentUsed}% ctx`}>
                        {formatTokens(latestSession.totalTokens)}
                        {latestSession.percentUsed > 0 && (
                          <span className="opacity-60 ml-0.5">({latestSession.percentUsed}%)</span>
                        )}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="opacity-40">sem sessão</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section B — Cron Health */}
      <section className="rounded-md border border-border/40 bg-background/30 p-3">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Clock size={11} className="text-muted-foreground" />
          <span className="text-[0.667rem] font-semibold uppercase tracking-wider text-muted-foreground">Cron Health</span>
        </div>
        {cronJobs.length === 0 ? (
          <div className="text-[0.667rem] text-muted-foreground/50">Nenhum cron encontrado</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {cronJobs.map(job => {
              const hasError = job.lastStatus === 'error' || !!job.lastError;
              const isEnabled = job.enabled;
              return (
                <div key={job.id} className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-medium truncate ${!isEnabled ? 'opacity-40' : ''}`}>
                      {job.name || job.label || job.id}
                    </span>
                    <span className={`text-[0.6rem] px-1 py-0.5 rounded-sm font-medium shrink-0 ${
                      !isEnabled
                        ? 'bg-muted/30 text-muted-foreground'
                        : hasError
                          ? 'bg-red-500/15 text-red-400'
                          : 'bg-green-500/15 text-green-400'
                    }`}>
                      {!isEnabled ? 'off' : hasError ? 'erro' : 'ok'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[0.6rem] text-muted-foreground/60">
                    {job.nextRun && (
                      <span>próx: {relative(new Date(job.nextRun).getTime(), true)}</span>
                    )}
                    {job.lastRun && (
                      <span>último: {relative(new Date(job.lastRun).getTime())}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Section C — Quick Stats */}
      <section>
        <div className="flex items-center gap-1.5 mb-2 px-0.5">
          <Users size={11} className="text-muted-foreground" />
          <span className="text-[0.667rem] font-semibold uppercase tracking-wider text-muted-foreground">Quick Stats</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <StatCard label="Sessions" value={sessions.length} />
          <StatCard label="Crons ativos" value={activeCronCount} />
          <StatCard label="Agentes" value={agentSummaries.filter(a => a.status === 'active').length} suffix="/ 4" />
          <StatCard label="Erros cron" value={cronJobs.filter(j => j.lastStatus === 'error' || !!j.lastError).length} warn />
        </div>
      </section>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  suffix?: string;
  warn?: boolean;
}

function StatCard({ label, value, suffix, warn }: StatCardProps) {
  return (
    <div className="rounded-md border border-border/40 bg-background/30 p-2 flex flex-col gap-0.5">
      <span className={`text-lg font-bold leading-none ${warn && value > 0 ? 'text-red-400' : 'text-foreground'}`}>
        {value}{suffix && <span className="text-xs font-normal text-muted-foreground ml-0.5">{suffix}</span>}
      </span>
      <span className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  );
}
