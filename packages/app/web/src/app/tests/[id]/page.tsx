'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, AlertTriangle, ImageIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { formatDateTime, formatDuration, truncateId } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { useState, useEffect } from 'react';

export default function TestDetailPage() {
  const params = useParams();
  const testId = params.id as string;
  const [result, setResult] = useState<any>(null);

  const { data: test, loading, error } = useApi<any>(() => api.getTest(testId), {
    deps: [testId],
    pollInterval: 3000,
  });

  useEffect(() => {
    if (test && (test.status === 'completed' || test.status === 'failed')) {
      api.getTestResult(testId).then(setResult).catch(() => {});
    }
  }, [test?.status, testId]);

  if (loading && !test) {
    return <LoadingSkeleton variant="detail" />;
  }

  if (error) {
    return (
      <div className="card p-6">
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">
          <p className="font-medium">Error loading test</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!test) return null;

  const duration = test.startedAt && test.completedAt
    ? new Date(test.completedAt).getTime() - new Date(test.startedAt).getTime()
    : null;

  const screenshots = result?.screenshots || test.screenshots || [];
  const diffs = result?.diffs || [];
  const errors = result?.errors || test.errors || [];

  const overviewItems = [
    { label: 'Test ID', value: test.id, mono: true },
    { label: 'Session', value: test.sessionId, mono: true, link: `/sessions/${test.sessionId}` },
    { label: 'Status', value: test.status, badge: true },
    { label: 'Created', value: test.createdAt ? formatDateTime(test.createdAt) : 'N/A' },
    { label: 'Started', value: test.startedAt ? formatDateTime(test.startedAt) : 'Pending' },
    { label: 'Completed', value: test.completedAt ? formatDateTime(test.completedAt) : 'N/A' },
    { label: 'Duration', value: duration !== null ? formatDuration(duration) : 'N/A' },
    { label: 'Baseline', value: test.isBaseline ? 'Yes' : 'No', isBadge: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/tests" className="hover:text-gray-700">Tests</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">{truncateId(testId, 12)}</span>
      </div>

      <PageHeader
        title={`Test ${truncateId(testId, 12)}`}
        actions={<StatusBadge status={test.status} />}
      />

      <div className="card p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider">Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
          {overviewItems.map((item) => (
            <div key={item.label}>
              <p className="text-xs text-gray-500 mb-0.5">{item.label}</p>
              {item.badge ? (
                <StatusBadge status={item.value} />
              ) : item.isBadge ? (
                <span className={`badge ${item.value === 'Yes' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {item.value}
                </span>
              ) : item.link ? (
                <Link href={item.link} className="text-sm text-primary-600 hover:text-primary-700 font-mono text-xs">
                  {truncateId(item.value)}
                </Link>
              ) : (
                <p className={`text-sm text-gray-900 ${item.mono ? 'font-mono text-xs' : ''}`}>
                  {item.value}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="card border-red-200 bg-red-50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h3 className="font-semibold text-red-900">Errors</h3>
          </div>
          <ul className="space-y-1">
            {errors.map((err: string, i: number) => (
              <li key={i} className="text-sm text-red-700">{err}</li>
            ))}
          </ul>
        </div>
      )}

      {screenshots.length > 0 && (
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">
              Screenshots
              <span className="text-sm font-normal text-gray-500 ml-2">({screenshots.length})</span>
            </h3>
          </div>
          <div className="p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {screenshots.map((screenshot: any, i: number) => {
              const filename = typeof screenshot === 'string'
                ? screenshot.split('/').pop()
                : screenshot.path?.split('/').pop() || `screenshot-${i}`;
              const url = `/api/test-sessions/${testId}/screenshots/${filename}`;

              return (
                <div key={i} className="group relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                  <img
                    src={url}
                    alt={`Screenshot ${i + 1}`}
                    className="w-full h-auto object-contain"
                    loading="lazy"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-xs text-white truncate">{filename}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {diffs.length > 0 && (
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">
              Visual Diffs
              <span className="text-sm font-normal text-gray-500 ml-2">({diffs.length})</span>
            </h3>
          </div>
          <div className="p-6 space-y-6">
            {diffs.map((diff: any, i: number) => {
              const baseFilename = diff.baseScreenshot?.split('/').pop();
              const testFilename = diff.testScreenshot?.split('/').pop();
              const diffFilename = diff.diffImage?.split('/').pop();

              const passed = diff.passed ?? (diff.pixelDifference === 0);
              const diffPercent = diff.percentDifference != null
                ? `${diff.percentDifference.toFixed(2)}%`
                : null;

              return (
                <div key={i} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className={`badge ${passed ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {passed ? 'Passed' : 'Failed'}
                    </span>
                    {diffPercent && (
                      <span className="text-xs text-gray-500">{diffPercent} pixel difference</span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Baseline</p>
                      <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                        {baseFilename ? (
                          <img
                            src={`/api/user-sessions/${test.sessionId}/screenshots/${baseFilename}`}
                            alt="Baseline"
                            className="w-full h-auto"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-32 text-gray-400">
                            <ImageIcon className="w-6 h-6" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Test</p>
                      <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                        {testFilename ? (
                          <img
                            src={`/api/test-sessions/${testId}/screenshots/${testFilename}`}
                            alt="Test"
                            className="w-full h-auto"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-32 text-gray-400">
                            <ImageIcon className="w-6 h-6" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Diff</p>
                      <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                        {diffFilename ? (
                          <img
                            src={`/api/test-sessions/${testId}/screenshots/${diffFilename}`}
                            alt="Diff"
                            className="w-full h-auto"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-32 text-gray-400">
                            <ImageIcon className="w-6 h-6" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {test.status === 'pending' && (
        <div className="card p-8 text-center">
          <div className="animate-pulse space-y-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full mx-auto flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-sm text-gray-600">Waiting for test to start...</p>
          </div>
        </div>
      )}

      {test.status === 'running' && !screenshots.length && (
        <div className="card p-8 text-center">
          <div className="space-y-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full mx-auto flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-sm text-gray-600">Test is running, screenshots will appear here...</p>
          </div>
        </div>
      )}
    </div>
  );
}
