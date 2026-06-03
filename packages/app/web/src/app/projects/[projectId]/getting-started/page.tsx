'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProject } from '@/lib/projectContext';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { Topbar } from '@/components/taka/Topbar';
import { Panel, PanelHead } from '@/components/taka/Panel';
import { Button } from '@/components/taka/Button';
import { Ico } from '@/components/taka/Icons';
import { Spinner } from '@/components/taka/Spinner';
import { ThemeToggle } from '@/components/taka/ThemeToggle';

export default function GettingStartedPage() {
  const project = useProject();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const { data, refetch } = useApi(
    () => api.getSessions(project.id, { limit: 1 }),
    { deps: [project.id], pollInterval: 3_000 },
  );

  const firstSession = data?.sessions?.[0];

  // Auto-redirect when the first session arrives
  useEffect(() => {
    if (firstSession) {
      const t = setTimeout(() => {
        router.push(`/projects/${project.id}/sessions/${firstSession.id}`);
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [firstSession, project.id, router]);

  const snippet = `<script src="https://cdn.taka.dev/recorder.min.js" defer></script>
<script>
  window.addEventListener('load', () => {
    TakaRecorder.init({
      apiEndpoint: 'http://localhost:9001/api',
      projectId: '${project.id}',
      uploadInterval: 5000,
      enableNetworkCapture: true,
      enableStorageCapture: true,
    });
  });
</script>`;

  const copy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Topbar
        crumbs={[{ label: project.name }, { label: 'getting started' }]}
        right={<ThemeToggle />}
      />
      <div className="tk-content" style={{ maxWidth: 920 }}>
        <div className="tk-pagehead">
          <div>
            <div className="eyebrow">// quickstart</div>
            <h1>get your first diff.</h1>
            <div className="sub">three steps. five minutes. your first session in the dashboard.</div>
          </div>
        </div>

        {/* Stepper */}
        <div
          className="border-border bg-panel mb-5 grid border"
          style={{ gridTemplateColumns: '1fr 1fr 1fr' }}
        >
          <StepCell
            n="01"
            label="install snippet"
            active={!firstSession}
            done={!!firstSession}
            hint={firstSession ? 'done' : 'paste this into your html'}
          />
          <StepCell
            n="02"
            label="first session arrives"
            active={!firstSession}
            done={!!firstSession}
            hint={firstSession ? 'received — redirecting…' : 'waiting…'}
            spin={!firstSession}
            border
          />
          <StepCell
            n="03"
            label="approve baseline"
            active={false}
            done={false}
            hint="after the first replay"
            border
          />
        </div>

        {/* Step 1 — install snippet */}
        <Panel className="mb-4">
          <PanelHead
            title="// 01 — drop this into your <head>"
            sub="pre-filled with this project's id"
            right={
              <Button size="sm" onClick={copy}>
                <Ico.Copy className="ico" />
                {copied ? 'copied' : 'copy'}
              </Button>
            }
          />
          <div className="p-5">
            <pre className="tk-code">
              <span className="gutter">1 </span>
              <span className="tk-com">{'// taka recorder — recording starts on load'}</span>
              {'\n'}
              <span className="gutter">2 </span>
              {'<'}<span className="tk-fn">script</span>{' '}
              <span className="tk-attr">src</span>={'"'}<span className="tk-str">{'https://cdn.taka.dev/recorder.min.js'}</span>{'" '}
              <span className="tk-attr">defer</span>{'>'}{'<'}/<span className="tk-fn">script</span>{'>'}
              {'\n'}
              <span className="gutter">3 </span>{'<'}<span className="tk-fn">script</span>{'>'}
              {'\n'}
              <span className="gutter">4 </span>  <span className="tk-kw">window</span>.addEventListener({'\''}<span className="tk-str">load</span>{'\''}, () =&gt; {'{'}
              {'\n'}
              <span className="gutter">5 </span>    <span className="tk-fn">TakaRecorder</span>.<span className="tk-fn">init</span>({'{'}
              {'\n'}
              <span className="gutter">6 </span>      <span className="tk-attr">apiEndpoint</span>: {'\''}<span className="tk-str">http://localhost:9001/api</span>{'\''},
              {'\n'}
              <span className="gutter">7 </span>      <span className="tk-attr">projectId</span>: {'\''}<span className="tk-str">{project.id}</span>{'\''},
              {'\n'}
              <span className="gutter">8 </span>      <span className="tk-attr">uploadInterval</span>: <span className="tk-str">5000</span>,
              {'\n'}
              <span className="gutter">9 </span>      <span className="tk-attr">enableNetworkCapture</span>: <span className="tk-kw">true</span>,
              {'\n'}
              <span className="gutter">10</span>      <span className="tk-attr">enableStorageCapture</span>: <span className="tk-kw">true</span>,
              {'\n'}
              <span className="gutter">11</span>    {'});'}
              {'\n'}
              <span className="gutter">12</span>  {'});'}
              {'\n'}
              <span className="gutter">13</span>{'<'}/<span className="tk-fn">script</span>{'>'}
            </pre>
            <div className="text-mid mt-3 flex items-center gap-2 text-[11.5px]">
              <span className="tk-kbd">{project.id}</span>
              <span>
                bound to <span className="text-fg">{project.name}</span>. switch projects in the sidebar to see a
                different id.
              </span>
            </div>
          </div>
        </Panel>

        {/* Step 2 — live status */}
        <Panel className="mb-4">
          <PanelHead
            title="// 02 — waiting for your first session"
            right={
              <Button size="sm" variant="ghost" onClick={() => refetch()}>
                <Ico.Refresh className="ico" />
                check now
              </Button>
            }
          />
          {firstSession ? (
            <div className="bg-bg border-border-soft flex items-center gap-4 border-b p-[22px]">
              <span className="text-diff-g">✓</span>
              <div>
                <div className="text-fg">first session received.</div>
                <div className="text-dim mt-1 text-[11.5px]">
                  redirecting to the session detail page…
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-bg border-border-soft flex items-center gap-4 border-b p-[22px]">
              <Spinner />
              <div className="flex-1">
                <div className="text-fg">
                  <span className="lime">$</span> taka listen --project {project.id}
                </div>
                <div className="text-dim mt-1 text-[11.5px]">
                  we&apos;ll redirect to the session detail page the moment one arrives. open your site and click
                  around.
                </div>
              </div>
              <span className="blink lime">_</span>
            </div>
          )}
        </Panel>

        {/* Config reference */}
        <Panel>
          <PanelHead
            title="// configuration reference"
            sub={
              <>
                all options for <span className="lime">TakaRecorder.init()</span>
              </>
            }
          />
          <table className="tk-table">
            <thead>
              <tr>
                <th className="w-[180px]">key</th>
                <th className="w-[90px]">type</th>
                <th className="w-[170px]">default</th>
                <th>description</th>
              </tr>
            </thead>
            <tbody>
              {CONFIG_ROWS.map(([k, t, d, desc]) => (
                <tr key={k}>
                  <td className="strong text-fg">{k}</td>
                  <td className="text-blue">{t}</td>
                  <td style={{ color: d === 'required' ? 'var(--diff-r)' : 'var(--mid)' }}>{d}</td>
                  <td className="prose text-mid">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}

function StepCell({
  n,
  label,
  active,
  done,
  hint,
  spin,
  border,
}: {
  n: string;
  label: string;
  active: boolean;
  done: boolean;
  hint?: string;
  spin?: boolean;
  border?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3 p-4"
      style={{
        background: active ? 'var(--panel-2)' : 'transparent',
        borderLeft: border ? '1px solid var(--border)' : undefined,
      }}
    >
      <span
        className="text-[12px] tracking-[0.18em]"
        style={{ color: done ? 'var(--diff-g)' : active ? 'var(--lime)' : 'var(--dim)' }}
      >
        {n}
      </span>
      <div className="flex-1">
        <div className="text-[12px]" style={{ color: active || done ? 'var(--fg)' : 'var(--mid)' }}>
          {label}
        </div>
        {hint && <div className="text-dim mt-1 text-[11px]">{hint}</div>}
      </div>
      {spin && <Spinner />}
      {done && <span className="text-diff-g">✓</span>}
    </div>
  );
}

const CONFIG_ROWS: [string, string, string, string][] = [
  ['projectId', 'string', 'required', "this project's id. The recorder throws at init if missing or empty."],
  ['apiEndpoint', 'string', 'http://localhost:9001/api', 'where the recorder ships sessions.'],
  ['uploadInterval', 'number', '5000', 'ms between batched uploads. lower = fresher, higher = less network.'],
  ['maxBatchSize', 'number', '100', 'max events per upload. forces flush when reached.'],
  ['enableNetworkCapture', 'boolean', 'true', 'record fetch + xhr for deterministic replay.'],
  ['enableStorageCapture', 'boolean', 'true', 'snapshot localstorage/sessionstorage/cookies (for auth).'],
  ['captureConsole', 'boolean', 'false', 'mirror console output into the session. (not yet implemented)'],
  ['autoStart', 'boolean', 'true', 'begin recording on init. set false to gate behind consent.'],
];
