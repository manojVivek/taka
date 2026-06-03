'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useProject } from '@/lib/projectContext';
import { TerminalMark } from './TerminalMark';
import { Ico } from './Icons';
import { ProjectSwitcher } from './ProjectSwitcher';

interface NavItem {
  id: string;
  name: string;
  icon: keyof typeof Ico;
  href: (projectId: string) => string;
  match: (pathname: string, projectId: string) => boolean;
}

const ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    name: 'overview',
    icon: 'Dashboard',
    href: id => `/projects/${id}`,
    match: (p, id) => p === `/projects/${id}`,
  },
  {
    id: 'sessions',
    name: 'sessions',
    icon: 'Sessions',
    href: id => `/projects/${id}/sessions`,
    match: (p, id) => p.startsWith(`/projects/${id}/sessions`),
  },
  {
    id: 'tests',
    name: 'tests',
    icon: 'Tests',
    href: id => `/projects/${id}/tests`,
    match: (p, id) => p.startsWith(`/projects/${id}/tests`),
  },
  {
    id: 'getting',
    name: 'getting started',
    icon: 'Book',
    href: id => `/projects/${id}/getting-started`,
    match: (p, id) => p === `/projects/${id}/getting-started`,
  },
  {
    id: 'settings',
    name: 'settings',
    icon: 'Settings',
    href: id => `/projects/${id}/settings`,
    match: (p, id) => p === `/projects/${id}/settings`,
  },
];

export function Sidebar() {
  const project = useProject();
  const pathname = usePathname() || '';

  return (
    <aside className="tk-sidebar">
      <div className="tk-logo-row">
        <TerminalMark size={24} />
        <span className="tk-wordmark">taka</span>
        <span className="tk-chip" style={{ marginLeft: 'auto' }}>v0.1.0</span>
      </div>

      <ProjectSwitcher current={project} />

      <div className="tk-navsection">// workspace</div>
      <nav className="tk-nav">
        {ITEMS.map(it => {
          const IconComp = Ico[it.icon];
          const active = it.match(pathname, project.id);
          return (
            <Link
              key={it.id}
              href={it.href(project.id)}
              className={`tk-nav-item${active ? ' active' : ''}`}
            >
              <IconComp className="ico" />
              <span>{it.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="tk-sidebar-foot">
        <div className="tk-status-row">
          <span className="pulse-dot" />
          <span>api connected</span>
          <span style={{ marginLeft: 'auto', color: 'var(--dim)', fontSize: 11 }}>:9001</span>
        </div>
        <div className="tk-status-row" style={{ color: 'var(--dim)', fontSize: 11 }}>
          <span>{project.id.slice(0, 12)}</span>
        </div>
      </div>
    </aside>
  );
}
