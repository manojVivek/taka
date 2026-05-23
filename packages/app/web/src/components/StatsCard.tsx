import { type LucideIcon } from 'lucide-react';

interface StatsCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  iconColor?: string;
  iconBg?: string;
}

export function StatsCard({ icon: Icon, label, value, iconColor = 'text-blue-600', iconBg = 'bg-blue-50' }: StatsCardProps) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3">
        <div className={`${iconBg} p-2.5 rounded-lg`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-semibold text-gray-900 truncate">{value}</p>
        </div>
      </div>
    </div>
  );
}
