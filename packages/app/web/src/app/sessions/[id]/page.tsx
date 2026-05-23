'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  MousePointer2,
  Type,
  ArrowDown,
  Navigation,
  Globe,
  Trash2,
  Play,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { formatDateTime, formatRelativeTime, getBrowserName, truncateId, formatBytes } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { useState } from 'react';

const eventIcons: Record<string, any> = {
  click: MousePointer2,
  input: Type,
  scroll: ArrowDown,
  navigation: Navigation,
  network: Globe,
};

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [replaying, setReplaying] = useState(false);

  const { data: session, loading, error } = useApi<any>(() => api.getSession(sessionId), {
    deps: [sessionId],
  });

  const handleReplay = async () => {
    setReplaying(true);
    try {
      const result: any = await api.replaySession(sessionId);
      if (result.testId) {
        router.push(`/tests/${result.testId}`);
      }
    } catch {
      // ignore
    } finally {
      setReplaying(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this session? This cannot be undone.')) return;
    try {
      await api.deleteSession(sessionId);
      router.push('/sessions');
    } catch {
      // ignore
    }
  };

  if (loading && !session) {
    return <LoadingSkeleton variant="detail" />;
  }

  if (error) {
    return (
      <div className="card p-6">
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">
          <p className="font-medium">Error loading session</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const events = session.events || [];
  const displayEvents = showAllEvents ? events : events.slice(0, 50);
  const sessionStart = events.length > 0 ? events[0].timestamp : session.timestamp;

  const metadata = [
    { label: 'URL', value: session.url },
    { label: 'Session ID', value: session.id, mono: true },
    { label: 'Recorded', value: formatDateTime(session.timestamp) },
    { label: 'Browser', value: getBrowserName(session.userAgent) },
    { label: 'Viewport', value: session.viewport ? `${session.viewport.width}x${session.viewport.height}` : 'N/A' },
    { label: 'Events', value: String(session.eventCount || events.length) },
    { label: 'Network Requests', value: String(session.networkRequestCount || 0) },
    { label: 'User ID', value: session.userId || 'Anonymous' },
    { label: 'Size', value: formatBytes(session.size || 0) },
    { label: 'Has Baseline', value: session.hasBaseline ? 'Yes' : 'No', badge: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/sessions" className="hover:text-gray-700">Sessions</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">{truncateId(sessionId)}</span>
      </div>

      <PageHeader
        title={session.title || 'Untitled Session'}
        description={session.url}
        actions={
          <>
            <button onClick={handleReplay} disabled={replaying} className="btn btn-primary">
              <Play className="w-4 h-4" />
              {replaying ? 'Starting...' : 'Run Test'}
            </button>
            <button onClick={handleDelete} className="btn btn-danger">
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </>
        }
      />

      <div className="card p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider">Session Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4">
          {metadata.map((item) => (
            <div key={item.label}>
              <p className="text-xs text-gray-500 mb-0.5">{item.label}</p>
              {item.badge ? (
                <span className={`badge ${item.value === 'Yes' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {item.value}
                </span>
              ) : (
                <p className={`text-sm text-gray-900 truncate ${item.mono ? 'font-mono text-xs' : ''}`}>
                  {item.value}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">
            Events Timeline
            <span className="text-sm font-normal text-gray-500 ml-2">({events.length} total)</span>
          </h3>
        </div>
        {events.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">No events recorded in this session.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {displayEvents.map((event: any, i: number) => {
              const IconComponent = eventIcons[event.type] || Clock;
              const relativeMs = event.timestamp - sessionStart;
              const relativeSeconds = (relativeMs / 1000).toFixed(1);

              return (
                <div key={i} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50/50 transition-colors">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                    <IconComponent className="w-4 h-4 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 font-medium capitalize">{event.type}</p>
                    {event.target && (
                      <p className="text-xs text-gray-500 font-mono truncate">{event.target}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 font-mono flex-shrink-0">+{relativeSeconds}s</span>
                </div>
              );
            })}
            {!showAllEvents && events.length > 50 && (
              <div className="px-6 py-4 text-center">
                <button
                  onClick={() => setShowAllEvents(true)}
                  className="btn btn-ghost btn-sm text-primary-600"
                >
                  Show all {events.length} events
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
