'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { LayoutDashboard, MonitorPlay, FlaskConical, BookOpen } from 'lucide-react';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';

const navItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, exact: true },
  { name: 'Sessions', href: '/sessions', icon: MonitorPlay, exact: false },
  { name: 'Tests', href: '/tests', icon: FlaskConical, exact: false },
  { name: 'Getting Started', href: '/getting-started', icon: BookOpen, exact: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: health } = useApi(() => api.getHealth().then(() => true).catch(() => false), {
    pollInterval: 10000,
  });

  const isConnected = health === true;

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col flex-shrink-0">
      <div className="px-5 py-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">T</span>
          </div>
          <span className="text-lg font-semibold tracking-tight">Taka</span>
        </Link>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-gray-800">
        <div className="flex items-center gap-2 text-sm">
          <span className={clsx('w-2 h-2 rounded-full', isConnected ? 'bg-green-400' : 'bg-red-400')} />
          <span className="text-gray-400">
            {isConnected ? 'API Connected' : 'API Disconnected'}
          </span>
        </div>
      </div>
    </aside>
  );
}
