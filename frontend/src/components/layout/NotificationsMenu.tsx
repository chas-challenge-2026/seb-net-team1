import { useNavigate } from '@tanstack/react-router';
import type { IconType } from 'react-icons';
import { LuBell, LuBellOff, LuCircleCheck, LuCircleX, LuStamp } from 'react-icons/lu';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '../../api/notifications';
import type { AppNotification, NotificationType } from '../../api/types';
import { useNow } from '../../hooks/useNow';
import { cn } from '../../utils/cn';
import { formatRelativeTime } from '../../utils/date';
import { NOTIFICATION_TONES } from '../../utils/labels';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorState';
import { Popover } from '../ui/Popover';
import { Skeleton } from '../ui/Skeleton';

const ICONS: Record<NotificationType, IconType> = {
  approval_requested: LuStamp,
  payment_completed: LuCircleCheck,
  payment_rejected: LuCircleX,
};

export function NotificationsMenu() {
  const notifications = useNotifications(20);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const navigate = useNavigate();
  const now = useNow();

  const unreadCount = notifications.data?.unreadCount ?? 0;
  const items = notifications.data?.items ?? [];

  function open(notification: AppNotification, close: () => void) {
    if (!notification.readAt) markRead.mutate(notification.id);
    if (notification.paymentId !== null) {
      close();
      void navigate({ to: '/payments/$paymentId', params: { paymentId: notification.paymentId } });
    }
  }

  return (
    <Popover
      label={unreadCount > 0 ? `Notiser, ${unreadCount} olästa` : 'Notiser'}
      triggerClassName="icon-button topbar__icon-button"
      panelClassName="notifications"
      triggerContent={
        <>
          <LuBell aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="notification-count" aria-hidden="true">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </>
      }
    >
      {(close) => (
        <>
          <div className="notifications__header">
            <h2 className="notifications__title">Notiser</h2>
            <button
              type="button"
              className="link-button"
              onClick={() => markAllRead.mutate()}
              disabled={unreadCount === 0 || markAllRead.isPending}
            >
              Markera alla som lästa
            </button>
          </div>

          {notifications.isPending ? (
            <div className="notifications__loading" aria-label="Laddar notiser">
              {[0, 1, 2].map((row) => (
                <div key={row} className="notifications__skeleton">
                  <Skeleton circle width={32} height={32} />
                  <div>
                    <Skeleton width="70%" />
                    <Skeleton width="90%" height={12} />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.isError ? (
            <ErrorState
              compact
              error={notifications.error}
              title="Notiserna kunde inte hämtas"
              onRetry={() => void notifications.refetch()}
            />
          ) : items.length === 0 ? (
            <EmptyState compact icon={LuBellOff} title="Inga notiser" description="Du är helt uppdaterad." />
          ) : (
            <ul className="notifications__list">
              {items.map((notification) => {
                const Icon = ICONS[notification.type] ?? LuBell;
                const unread = !notification.readAt;
                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      className={cn('notification', unread && 'is-unread')}
                      onClick={() => open(notification, close)}
                    >
                      <span className={cn('notification__icon', `tone-${NOTIFICATION_TONES[notification.type] ?? 'neutral'}`)}>
                        <Icon aria-hidden="true" />
                      </span>
                      <span className="notification__body">
                        <span className="notification__title">
                          {notification.title}
                          {unread && <span className="visually-hidden"> (oläst)</span>}
                        </span>
                        <span className="notification__message">{notification.message}</span>
                        <time className="notification__time" dateTime={notification.createdAt}>
                          {formatRelativeTime(notification.createdAt, now)}
                        </time>
                      </span>
                      {unread && <span className="notification__dot" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Popover>
  );
}
