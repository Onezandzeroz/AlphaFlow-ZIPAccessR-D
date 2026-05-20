'use client';

import { useMemo, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useLanguageStore } from '@/lib/language-store';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Calendar,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  Infinity,
  ChevronDown,
  Check,
} from 'lucide-react';
import {
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  subMonths,
} from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────

interface DateRange {
  from: Date;
  to: Date;
}

interface DateRangeFilterProps {
  value: DateRange | null;
  onChange: (range: DateRange | null) => void;
}

// ─── Component ────────────────────────────────────────────────────

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const { language } = useLanguageStore();
  const isDa = language === 'da';
  const [open, setOpen] = useState(false);

  // ─── Predefined ranges ─────────────────────────────────────────

  const options = useMemo(() => {
    const now = new Date();
    const lastMonthDate = subMonths(now, 1);

    return [
      {
        key: 'this-month' as const,
        label: isDa ? 'Denne måned' : 'This Month',
        icon: Calendar,
        range: { from: startOfMonth(now), to: endOfMonth(now) } as DateRange,
      },
      {
        key: 'last-month' as const,
        label: isDa ? 'Sidste måned' : 'Last Month',
        icon: CalendarDays,
        range: { from: startOfMonth(lastMonthDate), to: endOfMonth(lastMonthDate) } as DateRange,
      },
      {
        key: 'this-quarter' as const,
        label: isDa ? 'Dette kvartal' : 'This Quarter',
        icon: CalendarRange,
        range: { from: startOfQuarter(now), to: endOfQuarter(now) } as DateRange,
      },
      {
        key: 'this-year' as const,
        label: isDa ? 'Dette år' : 'This Year',
        icon: CalendarClock,
        range: { from: startOfYear(now), to: endOfYear(now) } as DateRange,
      },
      {
        key: 'all-time' as const,
        label: isDa ? 'Altid' : 'All Time',
        icon: Infinity,
        range: null as DateRange | null,
      },
    ];
  }, [isDa]);

  // ─── Find the currently active option ──────────────────────────

  const activeOption = useMemo(() => {
    return options.find((opt) => {
      if (opt.range === null) return value === null;
      if (!value) return false;
      return (
        value.from.getTime() === opt.range.from.getTime() &&
        value.to.getTime() === opt.range.to.getTime()
      );
    });
  }, [options, value]);

  const ActiveIcon = activeOption?.icon ?? Calendar;

  const handleSelect = useCallback((range: DateRange | null) => {
    onChange(range);
    setOpen(false);
  }, [onChange]);

  // ─── Render ────────────────────────────────────────────────────

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 text-xs font-medium shrink-0 h-8 px-3"
        >
          <ActiveIcon className="h-3.5 w-3.5" />
          <span>{activeOption?.label ?? (isDa ? 'Denne måned' : 'This Month')}</span>
          <ChevronDown className={`h-3 w-3 opacity-50 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={4}
        className="w-52 rounded-xl p-1.5"
      >
        {options.map((opt, idx) => {
          const Icon = opt.icon;
          const isActive = activeOption?.key === opt.key;

          return (
            <div key={opt.key}>
              {idx === 4 && (
                <DropdownMenuSeparator className="my-1" />
              )}
              <DropdownMenuItem
                onClick={() => handleSelect(opt.range)}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-[#0d9488]/10 dark:bg-[#2dd4bf]/10'
                    : ''
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#0d9488] dark:text-[#2dd4bf]' : 'text-gray-400 dark:text-gray-500'}`} />
                <span className={`text-sm flex-1 ${isActive ? 'font-semibold text-[#0d9488] dark:text-[#2dd4bf]' : 'text-gray-700 dark:text-gray-300'}`}>
                  {opt.label}
                </span>
                {isActive && (
                  <Check className="h-3.5 w-3.5 text-[#0d9488] dark:text-[#2dd4bf]" />
                )}
              </DropdownMenuItem>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
