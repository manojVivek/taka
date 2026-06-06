'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useProject } from '@/lib/projectContext';
import { useApi } from '@/lib/hooks';
import { api, type TestExecution } from '@/lib/api';
import { formatRelativeTime, formatDuration, truncateId, displayOrigin } from '@/lib/utils';
import { Topbar } from '@/components/taka/Topbar';
import { Panel } from '@/components/taka/Panel';
import { Badge } from '@/components/taka/Badge';
import { Button } from '@/components/taka/Button';
import { ProgressBar } from '@/components/taka/ProgressBar';
import { ThemeToggle } from '@/components/taka/ThemeToggle';

type StatusFilter = 'all' | 'running' | 'failed' | 'passed' | 'pending';

const STATUS_OPTIONS: StatusFilter[] = ['all', 'running', 'failed', 'passed', 'pending'];

// The origin a test ran against — the replay target, else the recorded origin.
function testOrigin(t: TestExecution): string | undefined {
  return t.result?.targetOrigin || t.result?.sourceOrigin || undefined;
}

export default function TestsListPage() {
  const project = useProject();
  const router = useRouter();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [originFilter, setOriginFilter] = useState('');

  // Fetch all (POC scale) and filter client-side, so status counts and the
  // origin list stay accurate regardless of which filters are active.
  const { data, loading } = useApi(() => api.getTests(project.id, { limit: 100 }), {
    deps: [project.id],
    pollInterval: 2_000,
  });

  const all = useMemo(() => data?.tests ?? [], [data]);
  const total = data?.total ?? 0;

  // Resolve session id → title so test rows can show a human label. Tests only
  // carry the sessionId, so we map against the project's sessions.
  const { data: sessionsData } = useApi(() => api.getSessions(project.id, { limit: 200 }), {
    deps: [project.id],
  });
  const titleBySession = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sessionsData?.sessions ?? []) {
      if (s.title) m.set(s.id, s.title);
    }
    return m;
  }, [sessionsData]);

  const origins = useMemo(
    () => Array.from(new Set(all.map(testOrigin).filter(Boolean) as string[])).sort(),
    [all],
  );

  const counts = useMemo(
    () => ({
      all: all.length,
      running: all.filter(t => t.status === 'running').length,
      failed: all.filter(t => t.status === 'failed').length,
      passed: all.filter(t => t.status === 'completed').length,
      pending: all.filter(t => t.status === 'pending').length,
    }),
    [all],
  );

  const filtered = useMemo(() => {
    const wantStatus = filter === 'passed' ? 'completed' : filter;
    return all.filter(t => {
      if (filter !== 'all' && t.status !== wantStatus) return false;
      if (originFilter && testOrigin(t) !== originFilter) return false;
      return true;
    });
  }, [all, filter, originFilter]);

  const isFiltered = filter !== 'all' || !!originFilter;
  const activeRunning = all.some(t => t.status === 'running');

  return (
    <>
      <Topbar
        crumbs={[{ label: project.name }, { label: 'tests' }]}
        right={<ThemeToggle />}
      />
      <div className="tk-content">
        <div className="tk-pagehead">
          <div>
            <div className="eyebrow">// tests</div>
            <h1>tests.</h1>
            <div className="sub">
              {loading
                ? 'loading…'
                : isFiltered
                  ? `${filtered.length.toLocaleString()} of ${counts.all.toLocaleString()} test runs`
                  : `${counts.all.toLocaleString()} test run${counts.all === 1 ? '' : 's'}`}
            </div>
          </div>
          <div className="actions">
            <select
              className="tk-select"
              value={originFilter}
              onChange={e => setOriginFilter(e.target.value)}
              title="filter by the origin the test ran against"
            >
              <option value="">all origins</option>
              {origins.map(o => (
                <option key={o} value={o}>
                  {displayOrigin(o)}
                </option>
              ))}
            </select>
            <div className="tk-segmented">
              {STATUS_OPTIONS.map(s => (
                <button key={s} className={filter === s ? 'on' : ''} onClick={() => setFilter(s)}>
                  {s} <span className="text-dim text-[10px]">{counts[s] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <Panel>
          {filtered.length === 0 && !loading ? (
            <div className="text-dim p-12 text-center text-xs">
              {isFiltered ? 'no tests match these filters.' : 'no tests yet — click replay on a session to start one.'}
            </div>
          ) : (
            <table className="tk-table">
              <thead>
                <tr>
                  <th>test</th>
                  <th className="w-[110px]">status</th>
                  <th className="w-[220px]">progress / result</th>
                  <th className="w-20 text-right">duration</th>
                  <th className="w-[100px]">started</th>
                  <th className="w-[100px]" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <TestRow
                    key={t.id}
                    test={t}
                    sessionTitle={titleBySession.get(t.sessionId)}
                    onOpen={() => router.push(`/projects/${project.id}/tests/${t.id}`)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {activeRunning && (
          <div className="text-dim mt-4 flex items-center gap-2 text-[11px]">
            <span className="lime">●</span> auto-refreshing every 2s
          </div>
        )}

        {total > 100 && (
          <div className="text-dim mt-3 text-[11px]">
            showing the 100 most recent of {total.toLocaleString()} test runs.
          </div>
        )}
      </div>
    </>
  );
}

function TestRow({
  test,
  sessionTitle,
  onOpen,
}: {
  test: TestExecution;
  sessionTitle?: string;
  onOpen: () => void;
}) {
  const dur =
    test.startedAt && test.completedAt
      ? formatDuration(test.completedAt - test.startedAt)
      : '—';

  const failedCount = test.result?.diffs?.filter(d => !d.passed).length ?? 0;
  const totalFrames = test.result?.screenshots?.length ?? 0;

  return (
    <tr className="clickable" onClick={onOpen}>
      <td>
        <div className="flex max-w-[460px] flex-col gap-0.5">
          <span className="strong text-fg">{truncateId(test.id, 12)}</span>
          <span className="text-dim truncate text-[11px]">
            session {truncateId(test.sessionId, 10)}
            {sessionTitle ? ` · ${sessionTitle}` : ''}
          </span>
        </div>
      </td>
      <td>
        {test.status === 'running' && <Badge kind="running">running</Badge>}
        {test.status === 'pending' && <Badge kind="pending">pending</Badge>}
        {test.status === 'completed' && <Badge kind="passed">passed</Badge>}
        {test.status === 'failed' && <Badge kind="failed">{failedCount > 0 ? `${failedCount} failed` : 'failed'}</Badge>}
      </td>
      <td>
        {test.status === 'running' && (
          <div className="flex items-center gap-2.5">
            <ProgressBar value={50} />
            <span className="text-mid text-[11px]">replaying…</span>
          </div>
        )}
        {test.status === 'pending' && <span className="text-dim text-[11.5px]">queued</span>}
        {(test.status === 'completed' || test.status === 'failed') && totalFrames > 0 && (
          <FrameStrip diffs={test.result?.diffs ?? []} total={totalFrames} />
        )}
        {(test.status === 'completed' || test.status === 'failed') && totalFrames === 0 && (
          <span className="text-dim text-[11.5px]">no frames</span>
        )}
      </td>
      <td className="num">{dur}</td>
      <td className="text-dim">{formatRelativeTime(test.createdAt)}</td>
      <td className="actcell">
        {(test.status === 'completed' || test.status === 'failed') && (
          <Button size="sm" onClick={e => { e.stopPropagation(); onOpen(); }}>
            review →
          </Button>
        )}
      </td>
    </tr>
  );
}

function FrameStrip({ diffs, total }: { diffs: { passed: boolean; percentageDifference: number }[]; total: number }) {
  // One micro-block per frame, color based on pass/fail. Pad with neutral if total > diffs (no-baseline frames).
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex flex-1 gap-px">
        {Array.from({ length: total }).map((_, i) => {
          const d = diffs[i];
          let bg = 'var(--diff-g)';
          if (d) {
            if (!d.passed) bg = d.percentageDifference > 0.05 ? 'var(--diff-r)' : 'var(--yellow)';
          } else {
            bg = 'var(--border)';
          }
          return <div key={i} className="h-3.5 flex-1 opacity-90" style={{ background: bg }} />;
        })}
      </div>
      <span className="text-mid min-w-[36px] text-right text-[11px]">
        {diffs.filter(d => d.passed).length}/{diffs.length || total}
      </span>
    </div>
  );
}
