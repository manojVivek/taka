'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FlaskConical } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { formatRelativeTime, formatDuration, truncateId } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Pagination } from '@/components/Pagination';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';

const LIMIT = 20;
const STATUSES = ['all', 'pending', 'running', 'completed', 'failed'] as const;

export default function TestsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [offset, setOffset] = useState(0);

  const { data, loading, error } = useApi(
    () => api.getTests({
      limit: LIMIT,
      offset,
      ...(statusFilter !== 'all' && { status: statusFilter }),
    }),
    {
      deps: [statusFilter, offset],
      pollInterval: 5000,
    }
  );

  const tests: any[] = (data as any)?.tests || [];
  const total: number = (data as any)?.total || 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Tests" description="Visual regression test results" />

      <div className="flex items-center gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setOffset(0); }}
            className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-ghost'}`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <LoadingSkeleton variant="card" />
      ) : error ? (
        <div className="card p-5">
          <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>
        </div>
      ) : tests.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="No tests found"
          description={statusFilter !== 'all' ? 'No tests match this filter.' : 'Run a test by replaying a recorded session.'}
          actionLabel={statusFilter !== 'all' ? undefined : 'View Sessions'}
          actionHref={statusFilter !== 'all' ? undefined : '/sessions'}
        />
      ) : (
        <div className="space-y-3">
          {tests.map((test: any) => {
            const duration = test.startedAt && test.completedAt
              ? new Date(test.completedAt).getTime() - new Date(test.startedAt).getTime()
              : null;

            return (
              <Link
                key={test.id}
                href={`/tests/${test.id}`}
                className="card p-5 block hover:border-gray-300 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-900 font-mono">
                        {truncateId(test.id, 12)}
                      </span>
                      <StatusBadge status={test.status} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>Session: {truncateId(test.sessionId)}</span>
                      {duration !== null && <span>Duration: {formatDuration(duration)}</span>}
                      {test.screenshots?.length > 0 && (
                        <span>{test.screenshots.length} screenshots</span>
                      )}
                    </div>
                    {test.error && (
                      <p className="text-xs text-red-600 mt-1 truncate max-w-lg">{test.error}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">{formatRelativeTime(test.createdAt)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {total > LIMIT && (
        <Pagination total={total} limit={LIMIT} offset={offset} onPageChange={setOffset} />
      )}
    </div>
  );
}
