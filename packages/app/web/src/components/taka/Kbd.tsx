import type { ReactNode } from 'react';

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="tk-kbd">{children}</span>;
}
