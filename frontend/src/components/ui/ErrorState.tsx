import { LuRefreshCw, LuTriangleAlert } from 'react-icons/lu';
import { getErrorMessage } from '../../api/client';
import { cn } from '../../utils/cn';
import { Button } from './Button';

interface ErrorStateProps {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
  className?: string;
}

/** Shown when a data view failed to load. The message is the API's `detail`. */
export function ErrorState({
  error,
  title = 'Uppgifterna kunde inte hämtas',
  onRetry,
  retrying = false,
  compact = false,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn('error-state', compact && 'error-state--compact', className)} role="alert">
      <span className="error-state__icon">
        <LuTriangleAlert aria-hidden="true" />
      </span>
      <div className="error-state__text">
        <p className="error-state__title">{title}</p>
        <p className="error-state__message">{getErrorMessage(error)}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={LuRefreshCw} onClick={onRetry} loading={retrying}>
          Försök igen
        </Button>
      )}
    </div>
  );
}
