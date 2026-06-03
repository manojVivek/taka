'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useProject } from '@/lib/projectContext';
import { useApi } from '@/lib/hooks';
import { api, type TestExecution } from '@/lib/api';
import { formatRelativeTime, formatBytes, truncateId } from '@/lib/utils';
import { Topbar } from '@/components/taka/Topbar';
import { Panel, PanelHead } from '@/components/taka/Panel';
import { Badge } from '@/components/taka/Badge';
import { Button } from '@/components/taka/Button';
import { Ico } from '@/components/taka/Icons';
import { Spinner } from '@/components/taka/Spinner';
import { ThemeToggle } from '@/components/taka/ThemeToggle';
import { ReplayDialog } from '@/components/taka/ReplayDialog';

type BadgeKind = 'passed' | 'failed' | 'running' | 'pending';

function badgeKindForTest(status: TestExecution['status']): BadgeKind {
  return status === 'completed' ? 'passed' : status;
}

function dotColorForTest(status: TestExecution['status']): string {
  switch (status) {
    case 'completed':
      return 'var(--diff-g)';
    case 'failed':
      return 'var(--diff-r)';
    case 'running':
      return 'var(--blue)';
    default:
      return 'var(--dim)';
  }
}

export default function ProjectDashboardPage() {
  const project = useProject();
  const router = useRouter();
  const [replayOpen, setReplayOpen] = useState(false);

  const { data: stats } = useApi(() => api.getSessionStats(project.id), {
    deps: [project.id],
    pollInterval: 30_000,
  });
  const { data: sessions } = useApi(
    () => api.getSessions(project.id, { limit: 8, sortBy: 'timestamp', sortOrder: 'desc' }),
    { deps: [project.id], pollInterval: 30_000 },
  );
  const { data: queue } = useApi(() => api.getQueueStatus(project.id), {
    deps: [project.id],
    pollInterval: 3_000,
  });
  const { data: tests } = useApi(() => api.getTests(project.id, { limit: 4 }), {
    deps: [project.id],
    pollInterval: 3_000,
  });

  const activeQueue = (queue?.pending ?? 0) + (queue?.running ?? 0);
  const recents = sessions?.sessions ?? [];
  const latest = recents[0];

  return (
    <>
      <Topbar
        crumbs={[{ label: project.name }, { label: 'overview' }]}
        right={
          <>
            <ThemeToggle />
            <Button variant="primary" onClick={() => setReplayOpen(true)} disabled={!latest}>
              <Ico.Play className="ico" />
              replay latest
            </Button>
          </>
        }
      />
      <div className="tk-content">
        <div className="tk-pagehead">
          <div>
            <div className="eyebrow">// overview</div>
            <h1>{project.name}.</h1>
            <div className="sub">
              <span className="text-dim">{project.id}</span>
              {project.description && (
                <>
                  <span className="text-dim mx-2.5">·</span>
                  {project.description}
                </>
              )}
              {activeQueue > 0 && (
                <>
                  <span className="text-dim mx-2.5">·</span>
                  <span className="lime">● live</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="tk-statgrid">
          <Stat label="sessions" value={(stats?.totalSessions ?? 0).toLocaleString()} />
          <Stat label="events" value={(stats?.totalEvents ?? 0).toLocaleString()} />
          <Stat
            label="tests"
            value={(tests?.total ?? 0).toLocaleString()}
            delta={
              queue?.running ? (
                <span className="text-blue">{queue.running} running</span>
              ) : queue?.pending ? (
                <span className="text-dim">{queue.pending} pending</span>
              ) : null
            }
          />
          <Stat label="storage" value={formatBytes(stats?.totalSize ?? 0)} />
        </div>

        <div className="grid grid-cols-[1fr_360px] gap-4">
          <Panel>
            <PanelHead
              title="// recent sessions"
              sub="captured via the recorder sdk"
              right={
                <Link href={`/projects/${project.id}/sessions`} className="tk-btn ghost sm">
                  view all <Ico.ChevronR className="h-2.5 w-2.5" />
                </Link>
              }
            />
            {recents.length === 0 ? (
              <div className="text-dim p-8 text-center">
                no sessions yet.{' '}
                <Link href={`/projects/${project.id}/getting-started`} className="lime">
                  install the recorder →
                </Link>
              </div>
            ) : (
              <table className="tk-table">
                <thead>
                  <tr>
                    <th>url · title</th>
                    <th className="w-20 text-right">events</th>
                    <th className="w-[120px]">baseline</th>
                    <th className="w-[100px]">captured</th>
                  </tr>
                </thead>
                <tbody>
                  {recents.map(s => (
                    <tr
                      key={s.id}
                      className="clickable"
                      onClick={() => router.push(`/projects/${project.id}/sessions/${s.id}`)}
                    >
                      <td>
                        <div className="flex flex-col gap-0.5">
                          <span className="strong text-fg">{s.title || 'untitled'}</span>
                          <span className="text-dim text-[11px]">{s.url}</span>
                        </div>
                      </td>
                      <td className="num">{s.eventCount}</td>
                      <td>
                        {s.hasBaseline ? (
                          <Badge kind="baseline">baseline</Badge>
                        ) : (
                          <Badge kind="pending">none</Badge>
                        )}
                      </td>
                      <td className="text-dim">{formatRelativeTime(s.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <div className="flex flex-col gap-4">
            <Panel>
              <PanelHead
                title="// live queue"
                right={
                  queue && queue.running > 0 ? (
                    <Badge kind="running">{queue.running} running</Badge>
                  ) : queue && queue.pending > 0 ? (
                    <Badge kind="pending">{queue.pending} pending</Badge>
                  ) : (
                    <span className="text-dim text-[10.5px]">idle</span>
                  )
                }
              />
              {activeQueue === 0 ? (
                <div className="text-dim p-6 text-center text-xs">no tests running</div>
              ) : (
                <div>
                  {(tests?.tests ?? [])
                    .filter(t => t.status === 'running' || t.status === 'pending')
                    .map(t => (
                      <div key={t.id} className="tk-queue-item">
                        {t.status === 'running' ? (
                          <Spinner />
                        ) : (
                          <div className="border-border h-3 w-3 border-2 border-dashed" />
                        )}
                        <div className="min-w-0">
                          <div className="name">{truncateId(t.id, 10)}</div>
                          <div className="sub">{t.status === 'running' ? 'replaying' : 'queued'}</div>
                        </div>
                        <span className="text-dim text-[11px]">{truncateId(t.sessionId, 8)}</span>
                      </div>
                    ))}
                </div>
              )}
            </Panel>

            <Panel>
              <PanelHead title="// recent tests" />
              {(tests?.tests ?? []).length === 0 ? (
                <div className="text-dim p-6 text-center text-xs">no tests yet</div>
              ) : (
                <div>
                  {(tests?.tests ?? []).slice(0, 4).map(t => (
                    <Link
                      key={t.id}
                      href={`/projects/${project.id}/tests/${t.id}`}
                      className="tk-queue-item no-underline"
                    >
                      <span
                        className="h-1.5 w-1.5"
                        style={{ background: dotColorForTest(t.status) }}
                      />
                      <div className="min-w-0">
                        <div className="name">{truncateId(t.id, 10)}</div>
                        <div className="sub">{formatRelativeTime(t.createdAt)}</div>
                      </div>
                      <Badge kind={badgeKindForTest(t.status)}>{t.status}</Badge>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      </div>

      {replayOpen && latest && (
        <ReplayDialog
          projectId={project.id}
          sessionId={latest.id}
          sessionUrl={latest.url}
          sessionLabel={latest.title || undefined}
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

function Stat({ label, value, delta }: { label: string; value: string; delta?: React.ReactNode }) {
  return (
    <div className="tk-stat">
      <div className="label">// {label}</div>
      <div className="val">{value}</div>
      {delta && <div className="delta">{delta}</div>}
    </div>
  );
}
