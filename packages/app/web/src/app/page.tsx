import { SessionStats } from '@/components/SessionStats';
import { RecentSessionsTable } from '@/components/RecentSessionsTable';
import { TestQueue } from '@/components/TestQueue';
import { PageHeader } from '@/components/PageHeader';

export default function HomePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Overview of recorded sessions and test results" />

      <SessionStats />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentSessionsTable />
        </div>
        <div>
          <TestQueue />
        </div>
      </div>
    </div>
  );
}
