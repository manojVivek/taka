'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useProject } from '@/lib/projectContext';
import { useApi } from '@/lib/hooks';
import { api, type SessionSummary } from '@/lib/api';
import {
  formatRelativeTime,
  formatBytes,
  getBrowserName,
  truncateId,
  originOf,
  displayOrigin,
} from '@/lib/utils';
import { Topbar } from '@/components/taka/Topbar';
import { Panel } from '@/components/taka/Panel';
import { Badge } from '@/components/taka/Badge';
import { Button } from '@/components/taka/Button';
import { Input } from '@/components/taka/Input';
import { Ico } from '@/components/taka/Icons';
import { ThemeToggle } from '@/components/taka/ThemeToggle';
import { ReplayDialog } from '@/components/taka/ReplayDialog';

const PAGE_SIZE = 20;
const FETCH_LIMIT = 200; // POC scale: fetch all, then filter/paginate client-side

export default function SessionsListPage() {
  const project = useProject();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [originFilter, setOriginFilter] = useState('');
  const [sortBy, setSortBy] = useState<'timestamp' | 'eventCount'>('timestamp');
  const [page, setPage] = useState(0);
  const [replayFor, setReplayFor] = useState<SessionSummary | null>(null);

  const { data, loading, refetch } = useApi(
    () => api.getSessions(project.id, { limit: FETCH_LIMIT, sortBy, sortOrder: 'desc' }),
    { deps: [project.id, sortBy] },
  );

  const all = data?.sessions ?? [];
  const total = data?.total ?? 0;

  // Distinct recorded origins present, for the origin filter.
  const origins = useMemo(
    () => Array.from(new Set(all.map(s => originOf(s.url)))).sort(),
    [all],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(s => {
      if (originFilter && originOf(s.url) !== originFilter) return false;
      if (q && !(s.url.toLowerCase().includes(q) || (s.title || '').toLowerCase().includes(q)))
        return false;
      return true;
    });
  }, [all, search, originFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageIdx = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(pageIdx * PAGE_SIZE, pageIdx * PAGE_SIZE + PAGE_SIZE);
  const isFiltered = !!originFilter || search.trim().length > 0;

  const deleteSession = async (s: SessionSummary) => {
    if (!confirm(`delete session ${s.id.slice(0, 8)}?`)) return;
    await api.deleteSession(project.id, s.id);
    refetch();
  };

  return (
    <>
      <Topbar crumbs={[{ label: project.name }, { label: 'sessions' }]} right={<ThemeToggle />} />
      <div className="tk-content">
        <div className="tk-pagehead">
          <div>
            <div className="eyebrow">// sessions</div>
            <h1>sessions.</h1>
            <div className="sub">
              {loading
                ? 'loading…'
                : isFiltered
                  ? `${filtered.length.toLocaleString()} of ${total.toLocaleString()} session${total === 1 ? '' : 's'}`
                  : `${total.toLocaleString()} session${total === 1 ? '' : 's'} recorded`}
            </div>
          </div>
          <div className="actions">
            <Input
              leading={<Ico.Search className="ico" />}
              placeholder="grep url or title…"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(0);
              }}
              wrapperStyle={{ minWidth: 240 }}
            />
            <select
              className="tk-select"
              value={originFilter}
              onChange={e => {
                setOriginFilter(e.target.value);
                setPage(0);
              }}
              title="filter by recorded origin"
            >
              <option value="">all origins</option>
              {origins.map(o => (
                <option key={o} value={o}>
                  {displayOrigin(o)}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              onClick={() => setSortBy(s => (s === 'timestamp' ? 'eventCount' : 'timestamp'))}
            >
              <Ico.Sort className="ico" />
              {sortBy === 'timestamp' ? 'recent' : 'most events'}
            </Button>
          </div>
        </div>

        <Panel>
          {pageItems.length === 0 && !loading ? (
            <div className="text-dim p-12 text-center text-xs">
              {isFiltered
                ? 'no sessions match these filters.'
                : 'no sessions yet — install the recorder to get started.'}
            </div>
          ) : (
            <table className="tk-table">
              <thead>
                <tr>
                  <th>session</th>
                  <th className="w-[70px] text-right">events</th>
                  <th className="w-[50px] text-right">net</th>
                  <th className="w-[110px]">browser</th>
                  <th className="w-[110px]">baseline</th>
                  <th className="w-[70px] text-right">size</th>
                  <th className="w-[100px]">captured</th>
                  <th className="w-[140px]" />
                </tr>
              </thead>
              <tbody>
                {pageItems.map(s => (
                  <tr
                    key={s.id}
                    className="clickable"
                    onClick={() => router.push(`/projects/${project.id}/sessions/${s.id}`)}
                  >
                    <td>
                      <div className="flex max-w-[440px] flex-col gap-0.5">
                        <span className="strong text-fg truncate">{s.title || 'untitled'}</span>
                        <span className="text-dim truncate text-[11px]">
                          {truncateId(s.id)} · {s.url}
                        </span>
                      </div>
                    </td>
                    <td className="num">{s.eventCount}</td>
                    <td className="num">{s.networkRequestCount}</td>
                    <td className="text-dim text-[11.5px]">{getBrowserName(s.userAgent)}</td>
                    <td>
                      {s.hasBaseline ? <Badge kind="baseline">baseline</Badge> : <Badge kind="pending">none</Badge>}
                    </td>
                    <td className="num">{formatBytes(s.size)}</td>
                    <td className="text-dim">{formatRelativeTime(s.timestamp)}</td>
                    <td className="actcell">
                      <div className="flex justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                        <Button size="sm" onClick={() => setReplayFor(s)}>
                          <Ico.Play className="ico" />
                          replay
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteSession(s)} title="delete">
                          <Ico.Trash className="ico" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {filtered.length > PAGE_SIZE && (
            <div className="border-border bg-panel-2 flex items-center gap-3 border-t px-4 py-2.5">
              <span className="text-dim text-[11px]">
                showing {pageIdx * PAGE_SIZE + 1}–{Math.min((pageIdx + 1) * PAGE_SIZE, filtered.length)} of{' '}
                {filtered.length.toLocaleString()}
              </span>
              <div className="ml-auto flex gap-1">
                <Button size="sm" disabled={pageIdx === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
                  ← prev
                </Button>
                <span className="text-mid self-center px-2 text-[11px]">
                  page {pageIdx + 1} / {totalPages}
                </span>
                <Button
                  size="sm"
                  disabled={pageIdx + 1 >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  next →
                </Button>
              </div>
            </div>
          )}
        </Panel>

        {total > FETCH_LIMIT && (
          <div className="text-dim mt-3 text-[11px]">
            showing the {FETCH_LIMIT} most recent of {total.toLocaleString()} sessions — narrow with search.
          </div>
        )}
      </div>

      {replayFor && (
        <ReplayDialog
          projectId={project.id}
          sessionId={replayFor.id}
          sessionUrl={replayFor.url}
          sessionLabel={replayFor.title || undefined}
          onClose={() => setReplayFor(null)}
          onStarted={testId => {
            setReplayFor(null);
            router.push(`/projects/${project.id}/tests/${testId}`);
          }}
        />
      )}
    </>
  );
}
