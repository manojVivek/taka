import { clsx } from 'clsx';

interface LoadingSkeletonProps {
  variant: 'table' | 'card' | 'detail';
  rows?: number;
}

function SkeletonLine({ className }: { className?: string }) {
  return <div className={clsx('h-4 bg-gray-200 rounded animate-pulse', className)} />;
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-6 gap-4 px-4 py-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonLine key={i} className="h-3" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid grid-cols-6 gap-4 px-4 py-4 border-t border-gray-100">
          <SkeletonLine className="col-span-2" />
          <SkeletonLine />
          <SkeletonLine />
          <SkeletonLine />
          <SkeletonLine />
        </div>
      ))}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card p-5 space-y-3 animate-pulse">
          <SkeletonLine className="w-1/3" />
          <SkeletonLine className="w-2/3" />
          <SkeletonLine className="w-1/2" />
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-3">
        <SkeletonLine className="w-48 h-6" />
        <SkeletonLine className="w-20 h-6 rounded-full" />
      </div>
      <div className="card p-6">
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <SkeletonLine className="w-20 h-3" />
              <SkeletonLine className="w-32" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LoadingSkeleton({ variant, rows }: LoadingSkeletonProps) {
  switch (variant) {
    case 'table':
      return <TableSkeleton rows={rows} />;
    case 'card':
      return <CardSkeleton />;
    case 'detail':
      return <DetailSkeleton />;
  }
}
