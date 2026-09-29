import { cn } from '../../utils/cn';
import { initials } from '../../utils/format';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Initials in a circle. Decorative: the name is always shown as text next to it. */
export function Avatar({ name, size = 'md', className }: AvatarProps) {
  return (
    <span className={cn('avatar', `avatar--${size}`, className)} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
