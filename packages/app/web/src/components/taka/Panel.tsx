import type { CSSProperties, ReactNode } from 'react';

interface PanelProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Panel({ children, className = '', style }: PanelProps) {
  return (
    <div className={`tk-panel${className ? ' ' + className : ''}`} style={style}>
      {children}
    </div>
  );
}

interface PanelHeadProps {
  title?: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  style?: CSSProperties;
}

export function PanelHead({ title, sub, right, style }: PanelHeadProps) {
  return (
    <div className="tk-panel-head" style={style}>
      {title && <h3>{title}</h3>}
      {sub && <span className="sub">{sub}</span>}
      {right && <div className="right">{right}</div>}
    </div>
  );
}
