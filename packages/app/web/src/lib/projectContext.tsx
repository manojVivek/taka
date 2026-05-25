'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Project } from '@taka/types';

const ProjectContext = createContext<Project | null>(null);

export function ProjectProvider({ project, children }: { project: Project; children: ReactNode }) {
  return <ProjectContext.Provider value={project}>{children}</ProjectContext.Provider>;
}

export function useProject(): Project {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error('useProject called outside a ProjectProvider');
  }
  return ctx;
}

// Deterministic color picker based on project id — gives each project
// a stable accent dot without needing a stored field.
const PALETTE = ['#b6ff5b', '#ff4d6d', '#7fc8ff', '#4dd982', '#f5c84b', '#c8a8ff', '#ffa97f'];
export function projectAccent(projectId: string): string {
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    hash = (hash * 31 + projectId.charCodeAt(i)) & 0x7fffffff;
  }
  return PALETTE[hash % PALETTE.length];
}
