import type { ReactNode } from 'react';

type BadgeKind = 'passed' | 'failed' | 'running' | 'pending' | 'minor' | 'baseline';

interface Props {
  kind?: BadgeKind;
  children: ReactNode;
}

export function Badge({ kind, children }: Props) {
  return (
    <span className={`tk-badge${kind ? ' ' + kind : ''}`}>
      <span className="dot" />
      {children}
    </span>
  );
}
