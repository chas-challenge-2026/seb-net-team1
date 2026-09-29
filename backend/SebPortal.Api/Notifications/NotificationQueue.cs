using System.Threading.Channels;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using SebPortal.Api.Models;

namespace SebPortal.Api.Notifications;

/// <summary>
/// In-process queue of notification ids waiting for e-mail delivery. The database row
/// is the source of truth (the outbox), the channel only makes delivery immediate
/// instead of waiting for the dispatcher's periodic sweep.
/// </summary>
public sealed class NotificationQueue
{
    private readonly Channel<int> _channel = Channel.CreateUnbounded<int>(
        new UnboundedChannelOptions { SingleReader = true });

    public void Enqueue(int notificationId) => _channel.Writer.TryWrite(notificationId);

    public ChannelReader<int> Reader => _channel.Reader;
}

/// <summary>
/// Puts every notification saved through a DbContext on the queue once the save has
/// succeeded (only then do the rows have ids). One instance per DbContext.
/// </summary>
public sealed class NotificationOutboxInterceptor(NotificationQueue queue) : SaveChangesInterceptor
{
    private readonly List<Notification> _pending = [];

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        Collect(eventData.Context);
        return result;
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        Collect(eventData.Context);
        return ValueTask.FromResult(result);
    }

    public override int SavedChanges(SaveChangesCompletedEventData eventData, int result)
    {
        Flush();
        return result;
    }

    public override ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData eventData,
        int result,
        CancellationToken cancellationToken = default)
    {
        Flush();
        return ValueTask.FromResult(result);
    }

    public override void SaveChangesFailed(DbContextErrorEventData eventData) => _pending.Clear();

    public override Task SaveChangesFailedAsync(DbContextErrorEventData eventData, CancellationToken cancellationToken = default)
    {
        _pending.Clear();
        return Task.CompletedTask;
    }

    private void Collect(DbContext? context)
    {
        if (context is null)
        {
            return;
        }

        _pending.AddRange(context.ChangeTracker.Entries<Notification>()
            .Where(entry => entry.State == EntityState.Added && entry.Entity.EmailStatus == EmailStatuses.Pending)
            .Select(entry => entry.Entity));
    }

    private void Flush()
    {
        foreach (var notification in _pending)
        {
            queue.Enqueue(notification.Id);
        }
        _pending.Clear();
    }
}
