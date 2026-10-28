import React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    const variants = {
      primary:
        'bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm shadow-indigo-950 active:scale-[0.98]',
      secondary:
        'bg-slate-800 text-slate-200 hover:bg-slate-700/80 hover:text-white border border-slate-700/60',
      outline:
        'border border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800/60 hover:text-white',
      ghost:
        'bg-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-200',
      danger:
        'bg-rose-600/90 text-white hover:bg-rose-600 active:scale-[0.98] shadow-sm shadow-rose-950',
    };

    const sizes = {
      sm: 'px-2.5 py-1 text-xs rounded-md font-medium',
      md: 'px-3.5 py-1.5 text-sm rounded-lg font-medium',
      lg: 'px-5 py-2.5 text-base rounded-lg font-semibold',
      icon: 'h-8 w-8 rounded-lg flex items-center justify-center p-0',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

