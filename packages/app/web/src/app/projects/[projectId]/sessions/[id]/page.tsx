'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { SessionEvent } from '@taka/types';
import { useProject } from '@/lib/projectContext';
import { useApi } from '@/lib/hooks';
import { api, baselineScreenshotUrl, type BaselineScreenshot } from '@/lib/api';
import { formatRelativeTime, formatDuration, getBrowserName, truncateId, originOf } from '@/lib/utils';
import { Topbar } from '@/components/taka/Topbar';
import { Panel, PanelHead } from '@/components/taka/Panel';
import { Badge } from '@/components/taka/Badge';
import { Button } from '@/components/taka/Button';
import { Ico, type IconKey } from '@/components/taka/Icons';
import { Spinner } from '@/components/taka/Spinner';
import { ThemeToggle } from '@/components/taka/ThemeToggle';
import { ReplayDialog } from '@/components/taka/ReplayDialog';
import { MockShot } from '@/components/taka/MockShot';

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

  const { data: baselineData } = useApi(() => api.getBaselineScreenshots(project.id, sessionId), {
    deps: [project.id, sessionId],
  });
  const baselineShots = baselineData?.screenshots ?? [];

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

        {/* Baseline frames — the screenshots promoted to baseline on first replay */}
        <Panel className="mb-4">
          <PanelHead
            title="// baseline frames"
            sub={
              baselineShots.length
                ? `${baselineShots.length} screenshot${baselineShots.length === 1 ? '' : 's'} · captured on first replay`
                : 'no baseline yet'
            }
            right={
              session.hasBaseline ? <Badge kind="baseline">baseline</Badge> : <Badge kind="pending">none</Badge>
            }
          />
          {baselineShots.length === 0 ? (
            <div className="text-dim p-8 text-center text-xs">
              no baseline captured yet — replay this session to establish one.
            </div>
          ) : (
            <BaselineGallery projectId={project.id} sessionId={sessionId} shots={baselineShots} />
          )}
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

// Flipstrip gallery for a session's baseline frames — mirrors the test detail's
// frame strip: click a thumbnail (or use ← / →) to flip the large inline preview,
// active frame marked with a lime border. No new tab; everything stays on-page.
function BaselineGallery({
  projectId,
  sessionId,
  shots,
}: {
  projectId: string;
  sessionId: string;
  shots: BaselineScreenshot[];
}) {
  const [active, setActive] = useState(0);
  const idx = Math.min(active, shots.length - 1);

  // Arrow-key navigation, like flipping through a media previewer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') setActive(i => Math.max(0, Math.min(i, shots.length - 1) - 1));
      else if (e.key === 'ArrowRight') setActive(i => Math.min(shots.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shots.length]);

  const activeShot = shots[idx];
  const activeUrl = baselineScreenshotUrl(projectId, sessionId, activeShot.filename);

  return (
    <div className="flex flex-col gap-3.5 p-4">
      {/* Large inline preview of the selected frame */}
      <div className="tk-diff-stage">
        <div className="tk-diff-toolbar">
          <span className="text-dim">// frame</span>
          <span className="text-fg">{String(idx + 1).padStart(2, '0')}</span>
          <span className="text-dim">/ {shots.length}</span>
          <span className="text-dim">·</span>
          <span className="text-mid truncate">{activeShot.filename}</span>
          <span className="text-dim">· event {activeShot.eventIndex}</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-dim text-[11px]">
              <span className="tk-kbd">←</span> / <span className="tk-kbd">→</span>
            </span>
            <a href={activeUrl} target="_blank" rel="noreferrer" className="tk-btn ghost sm no-underline">
              <Ico.External className="ico" />
              open original
            </a>
          </div>
        </div>
        <BaselinePreview key={activeShot.filename} url={activeUrl} />
      </div>

      {/* Thumbnail strip */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {shots.map((s, i) => {
          const isActive = i === idx;
          const url = baselineScreenshotUrl(projectId, sessionId, s.filename);
          return (
            <button
              key={s.filename}
              onClick={() => setActive(i)}
              title={`frame ${i + 1} · event ${s.eventIndex}`}
              className={`bg-bg w-[84px] flex-shrink-0 cursor-pointer border-[1.5px] p-1 transition-colors ${
                isActive ? 'border-lime' : 'border-border hover:border-mid'
              }`}
            >
              <BaselineThumb url={url} />
              <div className="mt-1.5 flex items-center justify-between px-0.5">
                <span className="text-dim text-[10px]">{String(i + 1).padStart(2, '0')}</span>
                <span
                  className="h-1.5 w-1.5"
                  style={{ background: isActive ? 'var(--lime)' : 'var(--border)' }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BaselinePreview({ url }: { url: string }) {
  const [errored, setErrored] = useState(false);
  return (
    <div className="bg-bg relative h-[460px] overflow-hidden">
      <span className="text-dim absolute left-3.5 top-3 z-10 text-[9.5px] uppercase tracking-[0.18em]">
        // baseline
      </span>
      {!errored ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="baseline frame"
          className="absolute inset-0 h-full w-full object-contain"
          onError={() => setErrored(true)}
        />
      ) : (
        <MockShot variant="base" />
      )}
    </div>
  );
}

function BaselineThumb({ url }: { url: string }) {
  const [errored, setErrored] = useState(false);
  return (
    <div className="bg-panel-2 relative h-12 overflow-hidden">
      {!errored ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-top"
          onError={() => setErrored(true)}
        />
      ) : (
        <div className="bg-panel absolute inset-1" />
      )}
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
