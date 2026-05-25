'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import { projectAccent } from '@/lib/projectContext';
import type { Project } from '@taka/types';
import { TerminalMark } from '@/components/taka/TerminalMark';
import { Ico } from '@/components/taka/Icons';
import { Button, IconButton } from '@/components/taka/Button';
import { Input } from '@/components/taka/Input';
import { Badge } from '@/components/taka/Badge';
import { ThemeToggle } from '@/components/taka/ThemeToggle';

interface EnrichedProject extends Project {
  sessionCount: number;
  eventCount: number;
}

async function loadProjects(): Promise<EnrichedProject[]> {
  const list = await api.listProjects();
  const enriched = await Promise.all(
    list.projects.map(async p => {
      try {
        const stats = await api.getSessionStats(p.id);
        return { ...p, sessionCount: stats.totalSessions, eventCount: stats.totalEvents };
      } catch {
        return { ...p, sessionCount: 0, eventCount: 0 };
      }
    }),
  );
  return enriched;
}

export default function ProjectsLandingPage() {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const { data: projects, loading, error, refetch } = useApi(loadProjects);

  const filtered = (projects ?? []).filter(p =>
    !search.trim() || p.name.toLowerCase().includes(search.toLowerCase()) || p.id.includes(search),
  );
  const totalSessions = (projects ?? []).reduce((s, p) => s + p.sessionCount, 0);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="tk-topbar">
        <div className="flex items-center gap-3">
          <TerminalMark size={22} />
          <span className="tk-wordmark">taka</span>
          <span className="tk-chip ml-1">v0.1.0 · poc</span>
        </div>
        <div className="tk-topbar-right">
          <Input
            leading={<Ico.Search className="ico" />}
            placeholder="search projects · ⌘K"
            value={search}
            onChange={e => setSearch(e.target.value)}
            wrapperStyle={{ minWidth: 280 }}
          />
          <ThemeToggle />
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Ico.Plus className="ico" />
            new project
          </Button>
        </div>
      </header>

      <div className="tk-content flex-1 overflow-auto">
        <div className="tk-pagehead">
          <div>
            <div className="eyebrow">// 00 — workspace</div>
            <h1>projects.</h1>
            <div className="sub">
              {loading
                ? 'loading…'
                : `${filtered.length} project${filtered.length === 1 ? '' : 's'} · ${totalSessions} total sessions`}
            </div>
          </div>
        </div>

        {error && <div className="tk-panel border-diff-r text-diff-r p-4">{error}</div>}

        {!loading && filtered.length === 0 && !error && (
          <EmptyProjectsState onCreate={() => setCreating(true)} hasSearch={!!search} />
        )}

        {filtered.length > 0 && (
          <div className="tk-projgrid">
            {filtered.map((p, i) => (
              <ProjectCard key={p.id} project={p} index={i} total={filtered.length} />
            ))}
            <CreateTile onClick={() => setCreating(true)} />
          </div>
        )}
      </div>

      {creating && (
        <CreateProjectModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}

function ProjectCard({ project, index, total }: { project: EnrichedProject; index: number; total: number }) {
  const router = useRouter();
  const isLastInRow = (index + 1) % 3 === 0;
  const dropRightBorder = isLastInRow && index !== total - 1;
  return (
    <button
      className={`tk-projcard text-left${dropRightBorder ? ' border-r-0' : ''}`}
      onClick={() => router.push(`/projects/${project.id}`)}
    >
      <div className="top">
        <span className="pdot" style={{ background: projectAccent(project.id) }} />
        <div className="min-w-0 flex-1">
          <div className="name">{project.name}</div>
          <div className="pid">{project.id}</div>
        </div>
        {project.sessionCount > 0 && <Badge kind="baseline">active</Badge>}
      </div>
      <div className="desc">{project.description || 'no description'}</div>
      <div className="stats">
        <div className="s">
          <span className="v">{project.sessionCount.toLocaleString()}</span>
          <span className="l">sessions</span>
        </div>
        <div className="s">
          <span className="v">{project.eventCount.toLocaleString()}</span>
          <span className="l">events</span>
        </div>
        <div className="s">
          <span className="v mono text-mid text-[13px] tracking-normal">
            {formatRelativeTime(project.createdAt)}
          </span>
          <span className="l">created</span>
        </div>
      </div>
    </button>
  );
}

function CreateTile({ onClick }: { onClick: () => void }) {
  return (
    <button className="tk-projcard new min-h-[220px] border-r-0 text-center" onClick={onClick}>
      <Ico.Plus className="h-6 w-6" />
      <div className="sans text-fg text-[18px] font-medium tracking-tight">new project</div>
      <div className="text-dim max-w-[200px] text-[11px]">
        generates an install snippet pre-filled with the project id
      </div>
    </button>
  );
}

function EmptyProjectsState({ onCreate, hasSearch }: { onCreate: () => void; hasSearch: boolean }) {
  if (hasSearch) {
    return <div className="tk-panel text-dim p-10 text-center">no projects match your search.</div>;
  }
  return (
    <div className="tk-panel p-14 text-center">
      <div className="sans mb-2 text-[24px] font-medium tracking-tight">no projects yet.</div>
      <div className="prose text-mid mx-auto mb-6 max-w-[420px] leading-relaxed">
        Create your first project to get an install snippet. Paste it into your app and sessions start flowing into the
        dashboard.
      </div>
      <Button variant="primary" onClick={onCreate}>
        <Ico.Plus className="ico" />
        create your first project
      </Button>
    </div>
  );
}

function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [id, setId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setErr(null);
    try {
      const project = await api.createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        id: id.trim() || undefined,
      });
      onCreated();
      router.push(`/projects/${project.id}/getting-started`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to create project');
      setSubmitting(false);
    }
  };

  return (
    <div className="tk-modal-backdrop" onClick={onClose}>
      <form className="tk-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="tk-panel-head">
          <h3>// new project</h3>
          <div className="right">
            <IconButton type="button" onClick={onClose}>
              <Ico.X className="h-3 w-3" />
            </IconButton>
          </div>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <Field label="name" hint="display name, shown across the dashboard">
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="my-app"
              autoFocus
              wrapperStyle={{ width: '100%' }}
            />
          </Field>
          <Field label="description" hint="optional">
            <Input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="what does this project track?"
              wrapperStyle={{ width: '100%' }}
            />
          </Field>
          <Field label="project id" hint="optional — auto-generated if blank, used in install snippet">
            <Input
              value={id}
              onChange={e => setId(e.target.value)}
              placeholder="prj_..."
              wrapperStyle={{ width: '100%' }}
            />
          </Field>
          {err && <div className="text-diff-r text-xs">{err}</div>}
        </div>
        <div className="border-border bg-panel-2 flex justify-end gap-2 border-t px-4 py-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || submitting}>
            {submitting ? 'creating…' : 'create project'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-dim mb-1.5 block text-[11px] uppercase tracking-[0.18em]">// {label}</label>
      {children}
      {hint && <div className="text-dim mt-1.5 text-[11px]">{hint}</div>}
    </div>
  );
}
