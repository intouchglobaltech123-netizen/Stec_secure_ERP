import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export type StatTone = 'slate' | 'orange' | 'amber' | 'emerald' | 'blue' | 'rose' | 'teal';

const TONES: Record<StatTone, { label: string; value: string; icon: string; hover: string }> = {
  slate: { label: 'text-slate-500', value: 'text-slate-900', icon: 'text-slate-500', hover: 'hover:border-slate-300' },
  orange: { label: 'text-orange-700', value: 'text-orange-700', icon: 'text-orange-600', hover: 'hover:border-orange-300' },
  amber: { label: 'text-amber-700', value: 'text-amber-700', icon: 'text-amber-600', hover: 'hover:border-amber-300' },
  emerald: { label: 'text-emerald-700', value: 'text-emerald-700', icon: 'text-emerald-600', hover: 'hover:border-emerald-300' },
  blue: { label: 'text-blue-700', value: 'text-blue-700', icon: 'text-blue-600', hover: 'hover:border-blue-300' },
  rose: { label: 'text-rose-700', value: 'text-rose-700', icon: 'text-rose-600', hover: 'hover:border-rose-300' },
  teal: { label: 'text-teal-700', value: 'text-slate-900', icon: 'text-teal-600', hover: 'hover:border-teal-300' },
};

interface StatTileProps {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  icon: LucideIcon;
  tone?: StatTone;
  extra?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

// Compact number tile (the Inventory style): two per row on phones
export const StatTile: React.FC<StatTileProps> = ({ label, value, note, icon: Icon, tone = 'slate', extra, className = '', onClick }) => {
  const t = TONES[tone];
  return (
    <Card
      className={`border-slate-200 bg-white shadow-sm transition-colors ${t.hover} ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <CardContent className="p-3.5 space-y-1">
        <div className={`text-[11px] uppercase font-bold ${t.label} flex items-start justify-between gap-2`}>
          <span className="leading-tight">{label}</span>
          <Icon className={`w-3.5 h-3.5 shrink-0 ${t.icon}`} />
        </div>
        <div className={`text-2xl font-bold font-mono ${t.value}`}>{value}</div>
        {note && <p className="text-[11px] text-slate-500 leading-snug">{note}</p>}
        {extra}
      </CardContent>
    </Card>
  );
};
