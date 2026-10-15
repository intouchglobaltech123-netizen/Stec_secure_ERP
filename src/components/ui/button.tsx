import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'warning';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] cursor-pointer';

    const variants = {
      primary:
        'bg-orange-500 text-white hover:bg-orange-600 shadow-sm shadow-orange-500/25 border border-orange-500',
      secondary:
        'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200',
      outline:
        'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 shadow-2xs',
      ghost:
        'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
      danger:
        'bg-rose-600 text-white hover:bg-rose-700 shadow-sm border border-rose-600',
      success:
        'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/25 border border-emerald-600',
      warning:
        'bg-amber-600 text-white hover:bg-amber-700 shadow-sm border border-amber-600',
    };

    const sizes = {
      sm: 'h-8 px-3 text-[13px] gap-1.5',
      md: 'h-10 px-4 text-sm gap-2',
      lg: 'h-12 px-6 text-base gap-2.5',
      icon: 'h-9 w-9 p-0',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
