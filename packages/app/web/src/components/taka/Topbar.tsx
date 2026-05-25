import type { ReactNode } from 'react';
import { Fragment } from 'react';

interface Crumb {
  label: string;
  href?: string;
}

interface Props {
  crumbs?: Crumb[];
  right?: ReactNode;
}

export function Topbar({ crumbs = [], right }: Props) {
  return (
    <header className="tk-topbar">
      <div className="tk-crumbs">
        {crumbs.map((c, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="lime-slash">/</span>}
            {c.href && i < crumbs.length - 1 ? (
              <a href={c.href}>{c.label}</a>
            ) : (
              <span className={i === crumbs.length - 1 ? 'now' : ''}>{c.label}</span>
            )}
          </Fragment>
        ))}
      </div>
      {right && <div className="tk-topbar-right">{right}</div>}
    </header>
  );
}
