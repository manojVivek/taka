interface Props {
  value: number; // 0..100
}

export function ProgressBar({ value }: Props) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="tk-progress">
      <div className="bar" style={{ width: `${pct}%` }} />
    </div>
  );
}
