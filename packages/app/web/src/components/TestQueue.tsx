'use client';

import Link from 'next/link';
import { Clock, Play, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';

export function TestQueue() {
  const { data: queueStatus, loading, error } = useApi(() => api.getQueueStatus(), {
    pollInterval: 5000,
  });

  if (loading && !queueStatus) {
    return (
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Test Queue</h2>
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Test Queue</h2>
        <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>
      </div>
    );
  }

  if (!queueStatus) return null;

  const total = queueStatus.pending + queueStatus.running + queueStatus.completed;
  const isActive = queueStatus.pending > 0 || queueStatus.running > 0;

  const items = [
    { label: 'Pending', value: queueStatus.pending, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: 'Running', value: queueStatus.running, icon: Play, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Completed', value: queueStatus.completed, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
  ];

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Test Queue</h2>
        {isActive && (
          <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
        )}
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className={`flex items-center justify-between p-3 ${item.bg} rounded-lg`}>
            <div className="flex items-center gap-2">
              <item.icon className={`w-4 h-4 ${item.color}`} />
              <span className="text-sm font-medium text-gray-700">{item.label}</span>
            </div>
            <span className={`text-lg font-semibold ${item.color}`}>{item.value}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
        <span className="text-sm text-gray-500">Total: {total}</span>
        <Link href="/tests" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
          View all tests
        </Link>
      </div>
    </div>
  );
}
