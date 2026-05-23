'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MonitorPlay, Trash2, Eye, Play, ArrowUpDown } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { formatRelativeTime, getBrowserName, formatBytes, truncateId } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { Pagination } from '@/components/Pagination';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';

const LIMIT = 20;

export default function SessionsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState<'timestamp' | 'eventCount'>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetcher = useCallback(() => {
    if (search.trim()) {
      return api.searchSessions(search).then((res: any) => ({
        sessions: res.results || [],
        total: res.total || 0,
      }));
    }
    return api.getSessions({ limit: LIMIT, offset, sortBy, sortOrder });
  }, [search, offset, sortBy, sortOrder]);

  const { data, loading, error, refetch } = useApi(fetcher, {
    deps: [search, offset, sortBy, sortOrder],
  });

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this session?')) return;
    setDeleting(id);
    try {
      await api.deleteSession(id);
      refetch();
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  };

  const handleReplay = async (id: string) => {
    try {
      const result: any = await api.replaySession(id);
      if (result.testId) {
        router.push(`/tests/${result.testId}`);
      }
    } catch {
      // ignore
    }
  };

  const toggleSort = (field: 'timestamp' | 'eventCount') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setOffset(0);
  };

  const sessions = data?.sessions || [];
  const total = data?.total || 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Sessions" description="Recorded user sessions from your application" />

      <div className="flex items-center gap-4">
        <div className="flex-1 max-w-sm">
          <SearchInput
            value={search}
            onChange={(v) => { setSearch(v); setOffset(0); }}
            placeholder="Search sessions by URL or title..."
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleSort('timestamp')}
            className={`btn btn-sm ${sortBy === 'timestamp' ? 'btn-secondary' : 'btn-ghost'}`}
          >
            <ArrowUpDown className="w-3 h-3" />
            Date {sortBy === 'timestamp' && (sortOrder === 'desc' ? '↓' : '↑')}
          </button>
          <button
            onClick={() => toggleSort('eventCount')}
            className={`btn btn-sm ${sortBy === 'eventCount' ? 'btn-secondary' : 'btn-ghost'}`}
          >
            <ArrowUpDown className="w-3 h-3" />
            Events {sortBy === 'eventCount' && (sortOrder === 'desc' ? '↓' : '↑')}
          </button>
        </div>
      </div>

      <div className="card">
        {loading && !data ? (
          <div className="p-4">
            <LoadingSkeleton variant="table" rows={8} />
          </div>
        ) : error ? (
          <div className="p-5">
            <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={MonitorPlay}
            title={search ? 'No sessions found' : 'No sessions recorded yet'}
            description={search ? 'Try adjusting your search query.' : 'Add the recorder script to your app to start capturing sessions.'}
            actionLabel={search ? undefined : 'Getting Started'}
            actionHref={search ? undefined : '/getting-started'}
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
                  <th className="table-header">Size</th>
                  <th className="table-header">Recorded</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session: any) => (
                  <tr key={session.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="table-cell">
                      <Link href={`/sessions/${session.id}`} className="block">
                        <p className="text-sm font-medium text-gray-900 truncate max-w-[260px]">
                          {session.title || 'Untitled Session'}
                        </p>
                        <p className="text-xs text-gray-500 truncate max-w-[260px]">{session.url}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{truncateId(session.id)}</p>
                      </Link>
                    </td>
                    <td className="table-cell text-sm text-gray-600">{session.eventCount}</td>
                    <td className="table-cell text-sm text-gray-600">{session.networkRequestCount}</td>
                    <td className="table-cell text-sm text-gray-600">{getBrowserName(session.userAgent)}</td>
                    <td className="table-cell text-sm text-gray-600">{formatBytes(session.size || 0)}</td>
                    <td className="table-cell text-sm text-gray-500">{formatRelativeTime(session.timestamp)}</td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/sessions/${session.id}`} className="btn btn-ghost btn-sm">
                          <Eye className="w-3.5 h-3.5" />
                        </Link>
                        <button onClick={() => handleReplay(session.id)} className="btn btn-ghost btn-sm text-primary-600">
                          <Play className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(session.id)}
                          disabled={deleting === session.id}
                          className="btn btn-ghost btn-sm text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!search && total > LIMIT && (
        <Pagination total={total} limit={LIMIT} offset={offset} onPageChange={setOffset} />
      )}
    </div>
  );
}
