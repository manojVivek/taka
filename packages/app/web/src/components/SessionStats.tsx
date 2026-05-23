'use client';

import { MonitorPlay, MousePointer2, Globe, HardDrive } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { formatBytes } from '@/lib/utils';
import { StatsCard } from './StatsCard';

export function SessionStats() {
  const { data: stats, loading, error } = useApi(() => api.getSessionStats(), {
    pollInterval: 30000,
  });

  if (loading && !stats) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-200 rounded-lg" />
              <div className="space-y-2">
                <div className="h-3 w-16 bg-gray-200 rounded" />
                <div className="h-6 w-12 bg-gray-200 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-4">
        <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatsCard
        icon={MonitorPlay}
        label="Sessions"
        value={stats.totalSessions.toLocaleString()}
        iconColor="text-blue-600"
        iconBg="bg-blue-50"
      />
      <StatsCard
        icon={MousePointer2}
        label="Events"
        value={stats.totalEvents.toLocaleString()}
        iconColor="text-green-600"
        iconBg="bg-green-50"
      />
      <StatsCard
        icon={Globe}
        label="Network Requests"
        value={stats.totalNetworkRequests.toLocaleString()}
        iconColor="text-purple-600"
        iconBg="bg-purple-50"
      />
      <StatsCard
        icon={HardDrive}
        label="Storage"
        value={formatBytes(stats.totalSize)}
        iconColor="text-orange-600"
        iconBg="bg-orange-50"
      />
    </div>
  );
}
