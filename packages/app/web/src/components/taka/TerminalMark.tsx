interface Props {
  size?: number;
  theme?: 'dark' | 'light';
}

export function TerminalMark({ size = 24, theme = 'dark' }: Props) {
  const bg = theme === 'light' ? '#16171a' : '#e8e8e6';
  const bgInner = theme === 'light' ? '#f5f4ef' : '#0a0b0d';
  const color = '#b6ff5b';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block', flexShrink: 0 }}>
      <rect x="1" y="1" width="9" height="9" fill={bg} />
      <rect x="14" y="1" width="9" height="9" fill={bg} />
      <rect x="1" y="14" width="9" height="9" fill={bg} />
      <rect x="14" y="14" width="9" height="9" fill={color} />
      <rect x="15.5" y="15.5" width="6" height="6" fill={bgInner} />
    </svg>
  );
}
