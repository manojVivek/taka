'use client';

import type { Project } from '@taka/types';
import { ProjectProvider } from '@/lib/projectContext';
import { Sidebar } from '@/components/taka/Sidebar';

export function ProjectShell({ project, children }: { project: Project; children: React.ReactNode }) {
  return (
    <ProjectProvider project={project}>
      <div className="taka-shell">
        <Sidebar />
        <div className="tk-main">{children}</div>
      </div>
    </ProjectProvider>
  );
}
