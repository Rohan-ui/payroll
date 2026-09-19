import React from 'react';
import { cn } from '../../utils/cn';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type StatusRing = 'active' | 'notice' | 'resigned' | 'none';

interface AvatarProps {
  name: string;
  avatarUrl?: string;
  size?: AvatarSize;
  status?: StatusRing;
  className?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/** Deterministic hue from name so each person has a consistent colour */
function getHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  avatarUrl,
  size = 'md',
  status = 'none',
  className,
}) => {
  const sizeClasses: Record<AvatarSize, string> = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-base',
    xl: 'w-20 h-20 text-xl',
  };

  const ringClasses: Record<StatusRing, string> = {
    active:   'ring-2 ring-offset-2 ring-teal-400',
    notice:   'ring-2 ring-offset-2 ring-amber-400',
    resigned: 'ring-2 ring-offset-2 ring-red-400',
    none:     '',
  };

  const dotClasses: Record<StatusRing, string> = {
    active:   'bg-teal-400',
    notice:   'bg-amber-400',
    resigned: 'bg-red-400',
    none:     '',
  };

  const dotSizeClasses: Record<AvatarSize, string> = {
    xs: 'w-1.5 h-1.5',
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
    xl: 'w-4 h-4',
  };

  const hue = getHue(name);
  const bgStyle = { backgroundColor: `hsl(${hue}, 55%, 88%)`, color: `hsl(${hue}, 55%, 30%)` };

  return (
    <div className={cn('relative inline-flex shrink-0', className)}>
      <div
        className={cn(
          'rounded-full flex items-center justify-center font-semibold overflow-hidden',
          sizeClasses[size],
          status !== 'none' && ringClasses[status],
        )}
        style={avatarUrl ? undefined : bgStyle}
        aria-label={name}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span>{getInitials(name)}</span>
        )}
      </div>
      {status !== 'none' && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full border-2 border-white',
            dotClasses[status],
            dotSizeClasses[size],
          )}
          aria-hidden="true"
        />
      )}
    </div>
  );
};
