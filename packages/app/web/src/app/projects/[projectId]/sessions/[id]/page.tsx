'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { SessionEvent } from '@taka/types';
import { useProject } from '@/lib/projectContext';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { formatRelativeTime, formatDuration, getBrowserName, truncateId, originOf } from '@/lib/utils';
import { Topbar } from '@/components/taka/Topbar';
import { Panel, PanelHead } from '@/components/taka/Panel';
import { Button } from '@/components/taka/Button';
import { Ico, type IconKey } from '@/components/taka/Icons';
import { Spinner } from '@/components/taka/Spinner';
import { ThemeToggle } from '@/components/taka/ThemeToggle';
import { ReplayDialog } from '@/components/taka/ReplayDialog';

const EVENT_ICON: Record<string, IconKey> = {
  click: 'Click',
  input: 'Input',
  scroll: 'Scroll',
  navigation: 'Nav',
  mutation: 'Mutation',
  mousemove: 'Mouse',
  focus: 'Focus',
  blur: 'Focus',
  submit: 'Submit',
  resize: 'Resize',
};

type Filter = 'all' | 'click' | 'input' | 'mutation' | 'navigation' | 'network';

export default function SessionDetailPage() {
  const project = useProject();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sessionId = params.id;
  const [filter, setFilter] = useState<Filter>('all');
  const [replayOpen, setReplayOpen] = useState(false);

  const { data: session, loading, error } = useApi(() => api.getSession(project.id, sessionId), {
    deps: [project.id, sessionId],
  });

  const events = session?.events ?? [];
  const networkRequests = session?.networkRequests ?? [];
  const sessionStart = session?.timestamp ?? 0;
  const durationMs = events.length
    ? Math.max(0, events[events.length - 1].timestamp - sessionStart)
    : 0;

  const counts = useMemo(() => {
    const c = { all: events.length, click: 0, input: 0, mutation: 0, navigation: 0, network: networkRequests.length };
    for (const e of events) {
      if (e.type === 'click') c.click++;
      else if (e.type === 'input') c.input++;
      else if (e.type === 'mutation') c.mutation++;
      else if (e.type === 'navigation') c.navigation++;
    }
    return c;
  }, [events, networkRequests]);

  const filtered = useMemo(() => {
    if (filter === 'all') return events;
    if (filter === 'network') return [] as SessionEvent[];
    return events.filter(e => e.type === filter);
  }, [events, filter]);

  // 60-bar density sparkline
  const sparkline = useMemo(() => {
    if (!events.length || durationMs === 0) return [];
    const bins = new Array(60).fill(0);
    for (const e of events) {
      const t = e.timestamp - sessionStart;
      const idx = Math.min(59, Math.floor((t / durationMs) * 60));
      bins[idx]++;
    }
    const max = Math.max(...bins, 1);
    return bins.map(v => v / max);
  }, [events, durationMs, sessionStart]);

  const deleteSession = async () => {
    if (!confirm('delete this session? this cannot be undone.')) return;
    await api.deleteSession(project.id, sessionId);
    router.push(`/projects/${project.id}/sessions`);
  };

  if (loading && !session) {
    return (
      <>
        <Topbar crumbs={[{ label: project.name }, { label: 'sessions' }, { label: '…' }]} />
        <div className="tk-content flex items-center gap-3">
          <Spinner />
          <span className="text-mid">loading session…</span>
        </div>
      </>
    );
  }

  if (error || !session) {
    return (
      <>
        <Topbar crumbs={[{ label: project.name }, { label: 'sessions' }]} />
        <div className="tk-content">
          <Panel>
            <div className="text-diff-r p-6 text-sm">{error || 'session not found'}</div>
          </Panel>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar
        crumbs={[{ label: project.name }, { label: 'sessions', href: `/projects/${project.id}/sessions` }, { label: truncateId(sessionId, 8) }]}
        right={
          <>
            <ThemeToggle />
            <a href={session.url} target="_blank" rel="noreferrer" className="tk-btn">
              <Ico.External className="ico" />
              open url
            </a>
            <Button variant="primary" onClick={() => setReplayOpen(true)}>
              <Ico.Play className="ico" />
              replay as test
            </Button>
            <Button variant="danger" onClick={deleteSession}>
              <Ico.Trash className="ico" />
              delete
            </Button>
          </>
        }
      />
      <div className="tk-content" style={{ padding: '20px 24px 32px' }}>
        {/* Meta strip */}
        <Panel className="mb-4">
          <div className="flex flex-wrap items-center gap-7 p-5">
            <div>
              <div className="sans text-fg text-[22px] font-medium tracking-tight">
                {session.metadata.title || 'untitled session'}
              </div>
              <div className="text-dim mt-1.5 flex gap-3.5 text-[11px]">
                <span>{truncateId(sessionId)}</span>
                <span className="text-border">·</span>
                <span>{session.url}</span>
                <span className="text-border">·</span>
                <span>
                  <span className="lime">●</span> {events.length ? 'recording closed' : 'no events'}
                </span>
              </div>
            </div>
            <div className="ml-auto flex flex-wrap gap-7">
              <MetaTile k="origin" v={originOf(session.url)} />
              <MetaTile k="captured" v={formatRelativeTime(session.timestamp)} />
              <MetaTile k="duration" v={formatDuration(durationMs)} />
              <MetaTile k="events" v={String(events.length)} />
              <MetaTile k="network" v={`${networkRequests.length} reqs`} />
              <MetaTile
                k="viewport"
                v={
                  session.metadata.viewport
                    ? `${session.metadata.viewport.width}×${session.metadata.viewport.height}`
                    : '—'
                }
              />
              <MetaTile k="browser" v={getBrowserName(session.metadata.userAgent)} />
            </div>
          </div>
        </Panel>

        {/* Timeline */}
        <Panel>
          <PanelHead
            title="// event timeline"
            sub={`${events.length} events · ${formatDuration(durationMs)}`}
            right={
              <div className="tk-segmented">
                {(['all', 'click', 'input', 'mutation', 'navigation', 'network'] as Filter[]).map(k => (
                  <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
                    {k} <span className="text-dim text-[10px]">{counts[k]}</span>
                  </button>
                ))}
              </div>
            }
          />

          {/* Sparkline */}
          {sparkline.length > 0 && (
            <div className="border-border bg-bg border-b px-4 py-3.5">
              <div className="flex h-[34px] items-end gap-0.5">
                {sparkline.map((h, i) => (
                  <div
                    key={i}
                    className="bg-border flex-1 opacity-70"
                    style={{ height: `${Math.max(5, h * 28)}px`, background: h > 0.66 ? 'var(--lime)' : undefined }}
                  />
                ))}
              </div>
              <div className="text-dim mt-1.5 flex justify-between text-[10px]">
                <span>0s</span>
                <span>{(durationMs / 1000).toFixed(1)}s</span>
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="text-dim p-8 text-center text-xs">no events match this filter.</div>
          ) : (
            <div className="tk-evlist">
              {filtered.slice(0, 200).map((e, i) => {
                const IconComp = Ico[EVENT_ICON[e.type] ?? 'Click'];
                const offset = e.timestamp - sessionStart;
                return (
                  <div key={e.id || i} className="tk-ev">
                    <span className="time">+{offset}ms</span>
                    <span className="type">
                      <IconComp className="h-2.5 w-2.5" />
                    </span>
                    <div className="body">
                      <span className="name">{e.type}</span>
                      <span className="target">{e.target || '—'}</span>
                    </div>
                    <span className="meta">{e.data ? summarize(e.data) : ''}</span>
                    <span />
                  </div>
                );
              })}
              {filtered.length > 200 && (
                <div className="text-dim p-3 text-center text-[11px]">
                  showing first 200 of {filtered.length} events
                </div>
              )}
            </div>
          )}
        </Panel>

        {networkRequests.length > 0 && (
          <Panel className="mt-4">
            <PanelHead title="// network" sub={`${networkRequests.length} captured`} />
            <table className="tk-table">
              <thead>
                <tr>
                  <th className="w-[80px]">method</th>
                  <th>url</th>
                  <th className="w-[80px] text-right">status</th>
                  <th className="w-[80px] text-right">body</th>
                </tr>
              </thead>
              <tbody>
                {networkRequests.slice(0, 50).map(r => (
                  <tr key={r.id}>
                    <td className="strong text-fg">{r.method}</td>
                    <td className="text-mid truncate text-[11.5px]">{r.url}</td>
                    <td className="num">{r.response?.status ?? '—'}</td>
                    <td className="num">{(r.response?.body?.length ?? 0).toLocaleString()}b</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {networkRequests.length > 50 && (
              <div className="text-dim p-3 text-center text-[11px]">
                showing first 50 of {networkRequests.length} requests
              </div>
            )}
          </Panel>
        )}

        <Link
          href={`/projects/${project.id}/sessions`}
          className="tk-btn ghost sm mt-4 inline-flex no-underline"
        >
          ← back to sessions
        </Link>
      </div>

      {replayOpen && (
        <ReplayDialog
          projectId={project.id}
          sessionId={sessionId}
          sessionUrl={session.url}
          sessionLabel={session.metadata.title || undefined}
          onClose={() => setReplayOpen(false)}
          onStarted={testId => {
            setReplayOpen(false);
            router.push(`/projects/${project.id}/tests/${testId}`);
          }}
        />
      )}
    </>
  );
}

function MetaTile({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-dim text-[9.5px] uppercase tracking-[0.18em]">// {k}</span>
      <span className="text-fg text-[12.5px]">{v}</span>
    </div>
  );
}

function summarize(data: any): string {
  if (typeof data !== 'object' || data === null) return String(data);
  if (data.sensitive) return `[redacted ${data.length}c]`;
  if (typeof data.value === 'string') return `value: "${data.value.slice(0, 40)}"`;
  if (typeof data.x === 'number' && typeof data.y === 'number') return `${data.x},${data.y}`;
  if (typeof data.url === 'string') return data.url;
  if (Array.isArray(data.mutations)) return `${data.mutations.length} mutations`;
  return '';
}
