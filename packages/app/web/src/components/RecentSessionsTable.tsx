'use client';

import Link from 'next/link';
import { MonitorPlay, Play } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { formatRelativeTime, getBrowserName, truncateId } from '@/lib/utils';
import { LoadingSkeleton } from './LoadingSkeleton';
import { EmptyState } from './EmptyState';

export function RecentSessionsTable() {
  const { data, loading, error } = useApi(
    () => api.getSessions({ limit: 8, sortBy: 'timestamp', sortOrder: 'desc' }),
    { pollInterval: 30000 }
  );

  if (loading && !data) {
    return (
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Recent Sessions</h2>
        </div>
        <div className="p-4">
          <LoadingSkeleton variant="table" rows={5} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Recent Sessions</h2>
        <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>
      </div>
    );
  }

  const sessions = data?.sessions || [];

  return (
    <div className="card">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Recent Sessions</h2>
        <Link href="/sessions" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
          View all
        </Link>
      </div>
      {sessions.length === 0 ? (
        <EmptyState
          icon={MonitorPlay}
          title="No sessions yet"
          description="Add the recorder to your application to start capturing sessions."
          actionLabel="Get Started"
          actionHref="/getting-started"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="table-header">Session</th>
                <th className="table-header">Events</th>
                <th className="table-header">Requests</th>
                <th className="table-header">Browser</th>
                <th className="table-header">Recorded</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session: any) => (
                <tr key={session.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="table-cell">
                    <Link href={`/sessions/${session.id}`} className="block">
                      <p className="text-sm font-medium text-gray-900 truncate max-w-[240px]">
                        {session.title || 'Untitled Session'}
                      </p>
                      <p className="text-xs text-gray-500 truncate max-w-[240px]">{session.url}</p>
                    </Link>
                  </td>
                  <td className="table-cell text-sm text-gray-600">{session.eventCount}</td>
                  <td className="table-cell text-sm text-gray-600">{session.networkRequestCount}</td>
                  <td className="table-cell text-sm text-gray-600">{getBrowserName(session.userAgent)}</td>
                  <td className="table-cell text-sm text-gray-500">{formatRelativeTime(session.timestamp)}</td>
                  <td className="table-cell text-right">
                    <Link
                      href={`/sessions/${session.id}`}
                      className="btn btn-ghost btn-sm text-xs"
                    >
                      <Play className="w-3 h-3" />
                      Replay
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
