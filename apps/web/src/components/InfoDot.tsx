import React from 'react';
import { pillIconClass } from '@/components/ui/button';

type InfoDotProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: 'sm' | 'md';
};

const InfoDot = React.forwardRef<HTMLButtonElement, InfoDotProps>(
  ({ size = 'md', className = '', type = 'button', ...rest }, ref) => {
    const dim = size === 'sm' ? 'h-4 w-4 text-[10px]' : 'h-5 w-5 text-xs';
    return (
      <button
        ref={ref}
        type={type}
        aria-label={rest['aria-label'] || 'More info'}
        className={`${pillIconClass} ${dim} ${className}`}
        {...rest}
      >
        ⓘ
      </button>
    );
  }
);

InfoDot.displayName = 'InfoDot';

// Keep named export for existing imports
export { InfoDot };
export default InfoDot;
