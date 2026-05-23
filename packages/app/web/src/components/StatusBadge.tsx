import { clsx } from 'clsx';

type Status = 'pending' | 'running' | 'completed' | 'passed' | 'failed';

const statusStyles: Record<Status, { bg: string; text: string; dot?: string }> = {
  pending: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  running: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  completed: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  passed: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  failed: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const normalized = status.toLowerCase() as Status;
  const style = statusStyles[normalized] || statusStyles.pending;

  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', style.bg, style.text)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', style.dot, normalized === 'running' && 'animate-pulse')} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
