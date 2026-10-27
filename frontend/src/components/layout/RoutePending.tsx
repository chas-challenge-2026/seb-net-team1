import { Spinner } from '../ui/Spinner';

/** Shown in the content area while a page's code is loading (only if it takes a moment). */
export function RoutePending() {
  return (
    <div className="route-pending">
      <Spinner size="lg" label="Laddar sidan" />
    </div>
  );
}
