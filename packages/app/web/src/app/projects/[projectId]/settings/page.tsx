'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProject, projectAccent } from '@/lib/projectContext';
import { api } from '@/lib/api';
import { Topbar } from '@/components/taka/Topbar';
import { Panel, PanelHead } from '@/components/taka/Panel';
import { Button } from '@/components/taka/Button';
import { Input } from '@/components/taka/Input';
import { Ico } from '@/components/taka/Icons';
import { ThemeToggle } from '@/components/taka/ThemeToggle';

export default function SettingsPage() {
  const project = useProject();
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const dirty = name !== project.name || description !== (project.description ?? '');

  useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? '');
  }, [project.id, project.name, project.description]);

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setErr(null);
    try {
      await api.updateProject(project.id, {
        name: name.trim() || project.name,
        description: description.trim() ? description.trim() : undefined,
      });
      setSavedAt(Date.now());
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  const copyId = async () => {
    await navigator.clipboard.writeText(project.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
  };

  const remove = async () => {
    setSaving(true);
    try {
      await api.deleteProject(project.id);
      router.push('/');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'delete failed');
      setSaving(false);
    }
  };

  return (
    <>
      <Topbar
        crumbs={[{ label: project.name }, { label: 'settings' }]}
        right={
          <>
            <ThemeToggle />
            <Button variant="primary" onClick={save} disabled={!dirty || saving}>
              {saving ? 'saving…' : 'save changes'}
            </Button>
          </>
        }
      />
      <div className="tk-content" style={{ maxWidth: 800 }}>
        <div className="tk-pagehead">
          <div>
            <div className="eyebrow">// settings</div>
            <h1>{project.name}.</h1>
            <div className="sub">
              <span className="text-dim">{project.id}</span>
              {savedAt && (
                <>
                  <span className="text-dim mx-2.5">·</span>
                  <span className="diff-g">saved</span>
                </>
              )}
            </div>
          </div>
        </div>

        {err && (
          <div className="tk-panel border-diff-r text-diff-r mb-4 p-4 text-xs">{err}</div>
        )}

        <Panel className="mb-4">
          <PanelHead title="// general" />
          <div className="px-5 pb-5 pt-2">
            <Row label="project name" hint="display name shown across the dashboard.">
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                wrapperStyle={{ minWidth: 320 }}
              />
            </Row>
            <Row label="description" hint="optional. surfaces on the projects list.">
              <Input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="what does this project track?"
                wrapperStyle={{ minWidth: 320 }}
              />
            </Row>
            <Row label="accent color" hint="a colored dot in the project switcher (derived from project id).">
              <div className="flex items-center gap-2">
                <span
                  className="h-7 w-7 inline-block"
                  style={{ background: projectAccent(project.id), border: '1px solid var(--border)' }}
                />
                <span className="text-dim text-[11.5px]">{projectAccent(project.id)}</span>
              </div>
            </Row>
            <Row label="project id" hint="used in the install snippet. read-only.">
              <div className="flex items-center gap-2">
                <code className="bg-bg border-border text-fg border px-2.5 py-1 text-[12.5px]">
                  {project.id}
                </code>
                <Button size="sm" onClick={copyId}>
                  <Ico.Copy className="ico" />
                  {copiedId ? 'copied' : 'copy'}
                </Button>
              </div>
            </Row>
          </div>
        </Panel>

        <Panel className="mb-4">
          <PanelHead title="// diff thresholds" />
          <div className="px-5 pb-5 pt-2">
            <Row label="minor threshold" hint="below this percentage, diffs are flagged 'minor' (yellow).">
              <Input defaultValue="0.5%" disabled wrapperStyle={{ minWidth: 120 }} />
            </Row>
            <Row label="failure threshold" hint="at or above this percentage, the test fails.">
              <Input defaultValue="2.0%" disabled wrapperStyle={{ minWidth: 120 }} />
            </Row>
            <Row label="anti-aliasing tolerance" hint="pixelmatch's α parameter. higher = more tolerant.">
              <Input defaultValue="0.1" disabled wrapperStyle={{ minWidth: 120 }} />
            </Row>
            <div className="text-dim text-[11.5px] mt-3">
              thresholds are read-only — backend persistence not yet implemented.
            </div>
          </div>
        </Panel>

        <Panel style={{ borderColor: 'var(--diff-r)' }}>
          <PanelHead
            title={<span className="diff-r">// danger zone</span>}
            style={{ background: 'var(--diff-r-soft)' }}
          />
          {!confirmingDelete ? (
            <div className="flex items-start gap-4 p-5">
              <div className="flex-1">
                <div className="text-fg text-[13px]">delete this project</div>
                <div className="prose text-mid mt-1.5 text-xs leading-relaxed">
                  permanently destroys every session, test run, and screenshot under{' '}
                  <span className="text-fg strong">{project.name}</span>. this cannot be undone.
                </div>
              </div>
              <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
                <Ico.Trash className="ico" />
                delete project
              </Button>
            </div>
          ) : (
            <div className="p-5">
              <div className="text-fg text-[13px]">
                type <code className="bg-bg border-border text-fg border px-2 py-0.5 text-xs">{project.id}</code> to confirm
              </div>
              <ConfirmDeleteForm projectId={project.id} onCancel={() => setConfirmingDelete(false)} onConfirm={remove} />
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="tk-setrow">
      <div>
        <div className="lbl">{label}</div>
        {hint && <div className="hint">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ConfirmDeleteForm({
  projectId,
  onCancel,
  onConfirm,
}: {
  projectId: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState('');
  const matches = typed === projectId;
  return (
    <div className="mt-3 flex items-center gap-2">
      <Input
        value={typed}
        onChange={e => setTyped(e.target.value)}
        placeholder={projectId}
        wrapperStyle={{ minWidth: 280 }}
      />
      <Button variant="ghost" onClick={onCancel}>
        cancel
      </Button>
      <Button variant="danger" disabled={!matches} onClick={onConfirm}>
        <Ico.Trash className="ico" />
        permanently delete
      </Button>
    </div>
  );
}
