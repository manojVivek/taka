'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useProject } from '@/lib/projectContext';
import { useApi } from '@/lib/hooks';
import { api, type SessionSummary } from '@/lib/api';
import { formatRelativeTime, formatBytes, getBrowserName, truncateId } from '@/lib/utils';
import { Topbar } from '@/components/taka/Topbar';
import { Panel } from '@/components/taka/Panel';
import { Badge } from '@/components/taka/Badge';
import { Button } from '@/components/taka/Button';
import { Input } from '@/components/taka/Input';
import { Ico } from '@/components/taka/Icons';
import { ThemeToggle } from '@/components/taka/ThemeToggle';
import { ReplayDialog } from '@/components/taka/ReplayDialog';

const PAGE_SIZE = 20;

export default function SessionsListPage() {
  const project = useProject();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState<'timestamp' | 'eventCount'>('timestamp');
  const [replayFor, setReplayFor] = useState<SessionSummary | null>(null);

  const isSearching = search.trim().length > 0;

  const { data, loading, refetch } = useApi(
    () =>
      isSearching
        ? api.searchSessions(project.id, search.trim()).then(r => ({
            sessions: r.results,
            total: r.total,
            limit: r.total,
            offset: 0,
          }))
        : api.getSessions(project.id, { limit: PAGE_SIZE, offset, sortBy, sortOrder: 'desc' }),
    { deps: [project.id, search, offset, sortBy] },
  );

  const sessions = data?.sessions ?? [];
  const total = data?.total ?? 0;
  const totalPages = isSearching ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const deleteSession = async (s: SessionSummary) => {
    if (!confirm(`delete session ${s.id.slice(0, 8)}?`)) return;
    await api.deleteSession(project.id, s.id);
    refetch();
  };


  return (
    <>
      <Topbar
        crumbs={[{ label: project.name }, { label: 'sessions' }]}
        right={<ThemeToggle />}
      />
      <div className="tk-content">
        <div className="tk-pagehead">
          <div>
            <div className="eyebrow">// sessions</div>
            <h1>sessions.</h1>
            <div className="sub">
              {loading ? 'loading…' : `${total.toLocaleString()} session${total === 1 ? '' : 's'} recorded`}
            </div>
          </div>
          <div className="actions">
            <Input
              leading={<Ico.Search className="ico" />}
              placeholder="grep url or title…"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setOffset(0);
              }}
              wrapperStyle={{ minWidth: 260 }}
            />
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
          {sessions.length === 0 && !loading ? (
            <div className="text-dim p-12 text-center text-xs">
              {isSearching ? 'no sessions match your search.' : 'no sessions yet — install the recorder to get started.'}
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
                {sessions.map(s => (
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

          {!isSearching && total > PAGE_SIZE && (
            <div className="border-border bg-panel-2 flex items-center gap-3 border-t px-4 py-2.5">
              <span className="text-dim text-[11px]">
                showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total.toLocaleString()}
              </span>
              <div className="ml-auto flex gap-1">
                <Button size="sm" disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}>
                  ← prev
                </Button>
                <span className="text-mid self-center px-2 text-[11px]">
                  page {currentPage} / {totalPages}
                </span>
                <Button
                  size="sm"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(o => o + PAGE_SIZE)}
                >
                  next →
                </Button>
              </div>
            </div>
          )}
        </Panel>
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
