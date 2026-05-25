'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Project } from '@taka/types';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { projectAccent } from '@/lib/projectContext';
import { Ico } from './Icons';

interface Props {
  current: Project;
}

export function ProjectSwitcher({ current }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { data: projectList } = useApi(() => api.listProjects(), { enabled: open });

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const projects = projectList?.projects ?? [current];

  return (
    <div ref={containerRef} style={{ position: 'relative', borderBottom: '1px solid var(--border)' }}>
      <button className="tk-projswitch" onClick={() => setOpen(v => !v)}>
        <span className="pdot" style={{ background: projectAccent(current.id) }} />
        <div className="meta">
          <span className="label">// project</span>
          <span className="name">{current.name}</span>
        </div>
        <span className="keys">⌘P</span>
      </button>
      {open && (
        <div className="tk-switcher-pop">
          {projects.map(p => (
            <button
              key={p.id}
              className="item"
              onClick={() => {
                setOpen(false);
                if (p.id !== current.id) router.push(`/projects/${p.id}`);
              }}
            >
              <span className="pdot" style={{ background: projectAccent(p.id) }} />
              <span style={{ flex: 1, color: p.id === current.id ? 'var(--fg)' : 'var(--mid)' }}>{p.name}</span>
              <span style={{ fontSize: 10, color: 'var(--dim)' }}>{p.id.slice(0, 8)}</span>
            </button>
          ))}
          <button
            className="item new"
            onClick={() => {
              setOpen(false);
              router.push('/');
            }}
          >
            <Ico.Plus style={{ width: 12, height: 12 }} />
            <span>all projects</span>
          </button>
        </div>
      )}
    </div>
  );
}
