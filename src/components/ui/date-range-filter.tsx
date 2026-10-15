import React from 'react';
import { CalendarRange } from 'lucide-react';
import { DateRange, RANGE_PRESETS, RangePreset, presetRange, rangeLabel } from '@/lib/date-range';
import { localDateISO } from '@/lib/numbering';

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  // Custom ranges with a time of day as well as the date
  withTime?: boolean;
  className?: string;
}

const fieldCls =
  'h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-[13px] text-slate-900 focus:outline-none focus:border-orange-500 shadow-2xs';

// Preset choice (Today … All time) or a custom From / To, in India time
export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ value, onChange, withTime, className = '' }) => {
  const pickPreset = (preset: RangePreset) => {
    if (preset !== 'CUSTOM') {
      onChange(presetRange(preset));
      return;
    }
    // Custom starts from what was showing, so the person only adjusts it
    const today = localDateISO();
    const from = value.from || `${today.slice(0, 8)}01`;
    const to = value.to || today;
    onChange({
      preset,
      from: withTime && !from.includes('T') ? `${from}T00:00` : from,
      to: withTime && !to.includes('T') ? `${to}T23:59` : to,
    });
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <div className="relative">
        <CalendarRange className="w-4 h-4 text-orange-600 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <select
          aria-label="Date range"
          value={value.preset}
          onChange={(e) => pickPreset(e.target.value as RangePreset)}
          className={`${fieldCls} pl-8 pr-7 font-semibold cursor-pointer`}
        >
          {RANGE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {value.preset === 'CUSTOM' ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            From
            <input
              type={withTime ? 'datetime-local' : 'date'}
              value={value.from}
              max={value.to || undefined}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
              className={fieldCls}
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            To
            <input
              type={withTime ? 'datetime-local' : 'date'}
              value={value.to}
              min={value.from || undefined}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              className={fieldCls}
            />
          </label>
        </div>
      ) : (
        <span className="text-xs text-slate-500 font-medium whitespace-nowrap">{rangeLabel(value)}</span>
      )}
    </div>
  );
};
