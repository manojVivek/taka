type Variant = 'base' | 'head' | 'diff';

export function MockShot({ variant = 'base' }: { variant?: Variant }) {
  const style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: variant === 'diff' ? 'var(--bg)' : 'var(--panel)',
  };
  const chromeStyle: React.CSSProperties = {
    height: 26,
    background: variant === 'diff' ? 'var(--bg)' : 'var(--panel-2)',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    gap: 6,
    flexShrink: 0,
  };
  const dot = { width: 8, height: 8, background: '#3a3c44' };
  const urlbar: React.CSSProperties = {
    flex: 1,
    height: 14,
    background: variant === 'diff' ? 'transparent' : 'var(--bg)',
    border: '1px solid var(--border-soft)',
    marginLeft: 8,
    opacity: variant === 'diff' ? 0.4 : 1,
  };
  const canvas: React.CSSProperties = {
    flex: 1,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  };

  // Hero block reads differently across variants
  const heroBg = variant === 'head' ? 'var(--panel)' : variant === 'diff' ? 'var(--bg)' : 'var(--panel-2)';
  const heroBorder = variant === 'diff' ? 'transparent' : 'var(--border-soft)';
  const headlineColor = variant === 'head' ? 'var(--fg)' : variant === 'diff' ? 'var(--diff-r)' : 'var(--mid)';
  const headlineW = variant === 'base' ? '60%' : '72%';
  const headlineShadow = variant === 'diff' ? '0 0 0 4px var(--diff-r-soft)' : undefined;

  const btnBg = variant === 'head' ? 'var(--lime)' : variant === 'diff' ? 'var(--diff-r)' : 'var(--mid)';
  const btnW = variant === 'base' ? 100 : 110;
  const btnShadow = variant === 'diff' ? '0 0 0 4px var(--diff-r-soft)' : undefined;

  const muteOpacity = variant === 'diff' ? 0.18 : 1;

  return (
    <div style={style}>
      <div style={chromeStyle}>
        <span style={dot} />
        <span style={dot} />
        <span style={dot} />
        <div style={urlbar} />
      </div>
      <div style={canvas}>
        <div style={{ height: 18, background: 'var(--panel-2)', border: '1px solid var(--border-soft)', opacity: muteOpacity }} />
        <div
          style={{
            height: 80,
            background: heroBg,
            border: `1px solid ${heroBorder}`,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 16px',
            gap: 8,
          }}
        >
          <div style={{ height: 10, width: headlineW, background: headlineColor, boxShadow: headlineShadow }} />
          <div style={{ height: 6, width: '40%', background: 'var(--dim)', opacity: variant === 'diff' ? 0.18 : 1 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              style={{
                height: 50,
                background: variant === 'diff' ? 'transparent' : 'var(--panel-2)',
                border: '1px solid var(--border-soft)',
                opacity: muteOpacity,
              }}
            />
          ))}
        </div>
        <div style={{ height: 8, background: variant === 'diff' ? 'transparent' : 'var(--panel-2)', opacity: muteOpacity }} />
        <div style={{ height: 8, width: '60%', background: variant === 'diff' ? 'transparent' : 'var(--panel-2)', opacity: muteOpacity }} />
        <div style={{ height: 8, width: '40%', background: variant === 'diff' ? 'transparent' : 'var(--panel-2)', opacity: muteOpacity }} />
        <div style={{ width: btnW, height: 30, background: btnBg, boxShadow: btnShadow }} />
      </div>
    </div>
  );
}
