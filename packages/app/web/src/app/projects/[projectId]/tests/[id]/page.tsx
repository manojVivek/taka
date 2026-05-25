'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { TestResult, VisualDiff } from '@taka/types';
import { useProject } from '@/lib/projectContext';
import { useApi } from '@/lib/hooks';
import {
  api,
  baselineScreenshotUrl,
  testDiffUrl,
  testScreenshotUrl,
} from '@/lib/api';
import { formatDuration, truncateId, formatRelativeTime } from '@/lib/utils';
import { Topbar } from '@/components/taka/Topbar';
import { Panel, PanelHead } from '@/components/taka/Panel';
import { Badge } from '@/components/taka/Badge';
import { Button } from '@/components/taka/Button';
import { Ico } from '@/components/taka/Icons';
import { Spinner } from '@/components/taka/Spinner';
import { ThemeToggle } from '@/components/taka/ThemeToggle';
import { MockShot } from '@/components/taka/MockShot';

type FrameStatus = 'pass' | 'minor' | 'fail';
type ViewMode = 'side-by-side' | 'slider' | 'onion' | 'diff-only';

function statusOf(d: VisualDiff): FrameStatus {
  if (d.passed) return 'pass';
  return d.percentageDifference >= 0.05 ? 'fail' : 'minor';
}

export default function TestDetailPage() {
  const project = useProject();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const testId = params.id;
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [activeFrameIdx, setActiveFrameIdx] = useState(0);

  const { data: test, loading } = useApi(() => api.getTest(project.id, testId), {
    deps: [project.id, testId],
    pollInterval: 3_000,
  });
  const polling = test?.status === 'running' || test?.status === 'pending';

  // Once the test finishes, fetch the full result.
  const [result, setResult] = useState<TestResult | null>(null);
  useEffect(() => {
    if (test?.status === 'completed' || test?.status === 'failed') {
      api
        .getTestResult(project.id, testId)
        .then(setResult)
        .catch(() => setResult(null));
    }
  }, [test?.status, project.id, testId]);

  const diffs = result?.diffs ?? [];
  const activeDiff = diffs[activeFrameIdx];

  const counts = useMemo(() => {
    const c = { total: diffs.length, pass: 0, minor: 0, fail: 0 };
    for (const d of diffs) {
      const s = statusOf(d);
      c[s]++;
    }
    return c;
  }, [diffs]);

  const duration =
    test?.startedAt && test?.completedAt ? formatDuration(test.completedAt - test.startedAt) : '—';

  if (loading && !test) {
    return (
      <>
        <Topbar crumbs={[{ label: project.name }, { label: 'tests' }, { label: '…' }]} />
        <div className="tk-content flex items-center gap-3">
          <Spinner />
          <span className="text-mid">loading test…</span>
        </div>
      </>
    );
  }

  if (!test) {
    return (
      <>
        <Topbar crumbs={[{ label: project.name }, { label: 'tests' }]} />
        <div className="tk-content">
          <Panel>
            <div className="text-diff-r p-6 text-sm">test not found</div>
          </Panel>
        </div>
      </>
    );
  }

  const jumpToFailure = (direction: 1 | -1) => {
    if (!diffs.length) return;
    if (direction === 1) {
      for (let i = activeFrameIdx + 1; i < diffs.length; i++) {
        if (statusOf(diffs[i]) === 'fail') {
          setActiveFrameIdx(i);
          return;
        }
      }
    } else {
      for (let i = activeFrameIdx - 1; i >= 0; i--) {
        if (statusOf(diffs[i]) === 'fail') {
          setActiveFrameIdx(i);
          return;
        }
      }
    }
  };

  const baseUrl =
    activeDiff && result
      ? baselineScreenshotUrl(project.id, result.sessionId, activeDiff.baseScreenshot.path)
      : null;
  const headUrl =
    activeDiff ? testScreenshotUrl(project.id, testId, activeDiff.headScreenshot.path) : null;
  const diffUrl =
    activeDiff && activeDiff.diffPath
      ? testDiffUrl(project.id, testId, activeDiff.diffPath.split('/').pop() || activeDiff.diffPath)
      : null;

  return (
    <>
      <Topbar
        crumbs={[
          { label: project.name },
          { label: 'tests', href: `/projects/${project.id}/tests` },
          { label: truncateId(testId, 10) },
        ]}
        right={
          <>
            <ThemeToggle />
            <Button onClick={() => router.refresh()}>
              <Ico.Refresh className="ico" />
              refresh
            </Button>
            <Button title="coming soon — endpoint not yet implemented" disabled>
              reject all <Ico.X className="ico" />
            </Button>
            <Button variant="primary" title="coming soon — endpoint not yet implemented" disabled>
              <Ico.Check className="ico" />
              approve all
            </Button>
          </>
        }
      />

      <div className="tk-content" style={{ padding: '18px 24px 32px' }}>
        {/* Status strip */}
        <Panel className="mb-3.5">
          <div className="flex items-center gap-[18px] p-5">
            {test.status === 'completed' && counts.fail === 0 && <Badge kind="passed">all passed</Badge>}
            {test.status === 'failed' && counts.fail > 0 && (
              <Badge kind="failed">
                {counts.fail} regression{counts.fail === 1 ? '' : 's'}
              </Badge>
            )}
            {test.status === 'running' && <Badge kind="running">running</Badge>}
            {test.status === 'pending' && <Badge kind="pending">pending</Badge>}
            <div>
              <div className="sans text-fg text-[22px] font-medium tracking-tight">
                test {truncateId(testId, 10)}
              </div>
              <div className="text-dim mt-1 text-[11px]">
                {testId} · session {truncateId(test.sessionId, 10)}
                {result?.isBaseline && (
                  <>
                    {' · '}
                    <span className="lime">baseline run</span>
                  </>
                )}
              </div>
            </div>
            <div className="ml-auto flex flex-wrap gap-7">
              <Stat k="frames" v={String(counts.total)} />
              <Stat k="passed" v={<span className="diff-g">{counts.pass}</span>} />
              <Stat k="minor" v={<span className="yellow">{counts.minor}</span>} />
              <Stat k="failed" v={<span className="diff-r">{counts.fail}</span>} />
              <Stat k="duration" v={duration} />
              <Stat k="created" v={formatRelativeTime(test.createdAt)} />
            </div>
          </div>
        </Panel>

        {/* Polling / status panels */}
        {polling && (
          <Panel className="mb-3.5">
            <div className="flex items-center gap-3 p-6">
              <Spinner />
              <div>
                <div className="text-fg text-sm">
                  {test.status === 'running' ? 'replaying session…' : 'queued, waiting for a runner…'}
                </div>
                <div className="text-dim mt-1 text-[11.5px]">
                  this page auto-refreshes every 3s while the test is in flight
                </div>
              </div>
            </div>
          </Panel>
        )}

        {/* Body */}
        {!polling && diffs.length === 0 && result?.isBaseline && (
          <Panel>
            <div className="p-10 text-center">
              <Badge kind="baseline">baseline created</Badge>
              <div className="sans mb-2 mt-4 text-[22px] font-medium tracking-tight">
                first run — baseline established.
              </div>
              <div className="prose text-mid mx-auto max-w-[460px] text-[13px] leading-relaxed">
                {result.screenshots.length} screenshot{result.screenshots.length === 1 ? '' : 's'} have been promoted as the baseline for this session. Re-run the same session to compare future changes against these frames.
              </div>
            </div>
          </Panel>
        )}

        {!polling && diffs.length === 0 && !result?.isBaseline && test.status !== 'pending' && (
          <Panel>
            <div className="text-dim p-10 text-center text-sm">no diff frames produced — see logs.</div>
          </Panel>
        )}

        {diffs.length > 0 && (
          <div className="grid items-start gap-3.5" style={{ gridTemplateColumns: '330px 1fr' }}>
            {/* Frame list */}
            <Panel>
              <PanelHead title="// frames" sub={String(diffs.length)} />
              <div className="tk-framelist max-h-[520px] overflow-auto">
                {diffs.map((d, i) => {
                  const s = statusOf(d);
                  const idx = d.baseScreenshot.eventIndex;
                  return (
                    <button
                      key={d.id}
                      className={`tk-framerow ${s} ${i === activeFrameIdx ? 'active' : ''}`}
                      onClick={() => setActiveFrameIdx(i)}
                    >
                      <span className="idx">{String(idx).padStart(2, '0')}</span>
                      <div className="min-w-0 text-left">
                        <div className="name">frame {idx}</div>
                        <div className="sel truncate">{d.baseScreenshot.path}</div>
                      </div>
                      <div className="pct">{d.percentageDifference === 0 ? '—' : (d.percentageDifference * 100).toFixed(1) + '%'}</div>
                      <div className="flex justify-end">
                        {s === 'pass' && <Badge kind="passed">pass</Badge>}
                        {s === 'minor' && <Badge kind="minor">minor</Badge>}
                        {s === 'fail' && <Badge kind="failed">fail</Badge>}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="border-border bg-panel-2 flex gap-2 border-t p-2.5">
                <Button size="sm" className="flex-1" onClick={() => jumpToFailure(-1)}>
                  ← prev failure
                </Button>
                <Button size="sm" className="flex-1" onClick={() => jumpToFailure(1)}>
                  next failure →
                </Button>
              </div>
            </Panel>

            {/* Diff viewer */}
            <div className="flex flex-col gap-3.5">
              <div className="tk-diff-stage">
                <div className="tk-diff-toolbar">
                  <span className="text-dim">// frame</span>
                  <span className="text-fg">{String(activeFrameIdx + 1).padStart(2, '0')}</span>
                  <span className="text-dim">/ {diffs.length}</span>
                  <span className="text-dim">·</span>
                  <span className="text-mid">{activeDiff?.baseScreenshot.path}</span>
                  {activeDiff && statusOf(activeDiff) !== 'pass' && (
                    <Badge kind={statusOf(activeDiff) === 'fail' ? 'failed' : 'minor'}>
                      {(activeDiff.percentageDifference * 100).toFixed(2)}% diff
                    </Badge>
                  )}

                  <div className="ml-auto flex gap-2">
                    <div className="tk-segmented">
                      <button
                        className={viewMode === 'side-by-side' ? 'on' : ''}
                        onClick={() => setViewMode('side-by-side')}
                      >
                        <Ico.Layers className="ico" />
                        side-by-side
                      </button>
                      <button title="coming soon" disabled>
                        <Ico.Slider className="ico" />
                        slider
                      </button>
                      <button title="coming soon" disabled>
                        <Ico.Eye className="ico" />
                        onion
                      </button>
                      <button title="coming soon" disabled>
                        diff only
                      </button>
                    </div>
                  </div>
                </div>

                <div className="tk-diff-frames">
                  <DiffFrame label="// baseline" url={baseUrl} mockVariant="base" />
                  <DiffFrame label="// head" url={headUrl} mockVariant="head" />
                  <DiffFrame
                    label="// diff"
                    url={diffUrl}
                    mockVariant="diff"
                    pct={
                      activeDiff && statusOf(activeDiff) !== 'pass'
                        ? `${(activeDiff.percentageDifference * 100).toFixed(1)}%`
                        : null
                    }
                  />
                </div>

                <div className="border-border bg-panel-2 flex items-center border-t px-3.5 py-3">
                  <div className="text-mid flex gap-5 text-[11.5px]">
                    <span>
                      <span className="text-fg">{activeDiff?.pixelDifference.toLocaleString() ?? 0}</span> px
                      changed
                    </span>
                    <span>
                      <span className="text-fg">
                        {((activeDiff?.percentageDifference ?? 0) * 100).toFixed(2)}%
                      </span>{' '}
                      of viewport
                    </span>
                    <span>
                      threshold{' '}
                      <span className="text-fg">
                        {((activeDiff?.threshold ?? 0.1) * 100).toFixed(1)}%
                      </span>
                    </span>
                    <span>
                      algo <span className="text-fg">pixelmatch</span>
                    </span>
                  </div>
                  <div className="ml-auto flex gap-2">
                    <Button title="coming soon — endpoint not yet implemented" disabled>
                      <Ico.X className="ico" />
                      reject · flag regression
                    </Button>
                    <Button
                      variant="success"
                      title="coming soon — endpoint not yet implemented"
                      disabled
                    >
                      <Ico.Check className="ico" />
                      accept as new baseline
                    </Button>
                  </div>
                </div>
              </div>

              {/* Frame strip */}
              <Panel>
                <PanelHead
                  title="// frame strip"
                  sub="jump to frame"
                  style={{ padding: '10px 14px' }}
                  right={
                    <span className="text-dim text-[11px]">
                      <span className="tk-kbd">←</span> / <span className="tk-kbd">→</span> to navigate
                    </span>
                  }
                />
                <div className="flex gap-1.5 overflow-x-auto p-3">
                  {diffs.map((d, i) => {
                    const s = statusOf(d);
                    const color = s === 'fail' ? 'var(--diff-r)' : s === 'minor' ? 'var(--yellow)' : 'var(--diff-g)';
                    const active = i === activeFrameIdx;
                    return (
                      <button
                        key={d.id}
                        onClick={() => setActiveFrameIdx(i)}
                        className="bg-bg w-[76px] flex-shrink-0 p-1"
                        style={{ border: active ? '1.5px solid var(--lime)' : '1px solid var(--border)' }}
                      >
                        <div className="bg-panel-2 relative h-12">
                          <div className="bg-panel absolute inset-1" />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="text-dim text-[10px]">{String(i + 1).padStart(2, '0')}</span>
                          <span className="h-1.5 w-1.5" style={{ background: color }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Panel>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-dim text-[9.5px] uppercase tracking-[0.18em]">// {k}</span>
      <span className="text-fg text-sm">{v}</span>
    </div>
  );
}

function DiffFrame({
  label,
  url,
  mockVariant,
  pct,
}: {
  label: string;
  url: string | null;
  mockVariant: 'base' | 'head' | 'diff';
  pct?: string | null;
}) {
  const [errored, setErrored] = useState(false);
  return (
    <div className="tk-diff-frame">
      <span className="label">{label}</span>
      {pct && <span className="pct">{pct}</span>}
      {url && !errored ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={label} onError={() => setErrored(true)} />
      ) : (
        <MockShot variant={mockVariant} />
      )}
    </div>
  );
}
