import * as React from 'react';
import { cn } from '@/lib/utils';

function Progress({
  className,
  value,
  max = 100,
  indicatorClassName,
  ...props
}: React.ComponentProps<'div'> & {
  value?: number;
  max?: number;
  indicatorClassName?: string;
}) {
  const percentage = Math.min(100, Math.max(0, ((value ?? 0) / max) * 100));

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn(
        'bg-muted relative h-2.5 w-full overflow-hidden rounded-full',
        className,
      )}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className={cn(
          'bg-primary h-full w-full flex-1 transition-all duration-300 ease-out',
          indicatorClassName,
        )}
        style={{ transform: `translateX(-${100 - percentage}%)` }}
      />
    </div>
  );
}

export { Progress };
