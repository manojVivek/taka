import { notFound } from 'next/navigation';
import type { Project } from '@taka/types';

const API_BASE_SSR = process.env.TAKA_API_URL || 'http://localhost:3001/api';

async function fetchProject(id: string): Promise<Project | null> {
  try {
    const res = await fetch(`${API_BASE_SSR}/projects/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as Project;
  } catch {
    return null;
  }
}

// Client-side wrapper that mounts the sidebar inside ProjectProvider.
import { ProjectShell } from './ProjectShell';

export default async function ProjectLayout({
  params,
  children,
}: {
  params: Promise<{ projectId: string }>;
  children: React.ReactNode;
}) {
  const { projectId } = await params;
  const project = await fetchProject(projectId);
  if (!project) notFound();

  return <ProjectShell project={project}>{children}</ProjectShell>;
}
