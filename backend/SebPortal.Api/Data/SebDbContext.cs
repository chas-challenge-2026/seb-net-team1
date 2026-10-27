using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using SebPortal.Api.Auditing;
using SebPortal.Api.Models;
using SebPortal.Api.Notifications;

namespace SebPortal.Api.Data;

/// <summary>
/// EF Core model for the whole database. The schema is owned by the migrations in
/// Data/Migrations (dotnet ef migrations add ...), applied at startup, so there is no
/// hand written schema SQL to drift from the model anymore.
/// </summary>
public class SebDbContext : DbContext
{
    private readonly IInterceptor[] _interceptors;

    /// <summary>
    /// The interceptors are resolved from DI in the application (every registration of
    /// the context gets them, including the test factories). Unit tests that create a
    /// context directly can pass them explicitly or leave them out.
    /// </summary>
    public SebDbContext(
        DbContextOptions<SebDbContext> options,
        AuditChainInterceptor? auditChainInterceptor = null,
        NotificationOutboxInterceptor? notificationOutboxInterceptor = null) : base(options)
    {
        _interceptors = new IInterceptor?[] { auditChainInterceptor, notificationOutboxInterceptor }
            .OfType<IInterceptor>()
            .ToArray();
    }

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
    {
        if (_interceptors.Length > 0)
        {
            optionsBuilder.AddInterceptors(_interceptors);
        }
    }

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<ApprovalStep> ApprovalSteps => Set<ApprovalStep>();
    public DbSet<AuditEntry> AuditEntries => Set<AuditEntry>();
    public DbSet<Transaction> Transactions => Set<Transaction>();
    public DbSet<Recipient> Recipients => Set<Recipient>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Tenants
        modelBuilder.Entity<Tenant>(entity =>
        {
            entity.ToTable("tenants");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Name).HasColumnName("name").HasMaxLength(100);
        });

        // Users
        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("users");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.TenantId).HasColumnName("tenant_id");
            entity.Property(e => e.Name).HasColumnName("name").HasMaxLength(100);
            entity.Property(e => e.Email).HasColumnName("email").HasMaxLength(100);
            entity.HasIndex(e => e.Email).IsUnique();
            entity.Property(e => e.PasswordHash).HasColumnName("password_hash").HasMaxLength(255);
            entity.Property(e => e.Role).HasColumnName("role").HasMaxLength(20);
            entity.Property(e => e.IsActive).HasColumnName("is_active");
            entity.Property(e => e.CreatedAt).HasColumnName("created_at");

            entity.HasOne(e => e.Tenant)
                .WithMany()
                .HasForeignKey(e => e.TenantId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Accounts
        modelBuilder.Entity<Account>(entity =>
        {
            entity.ToTable("accounts");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Version).IsRowVersion();
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.TenantId).HasColumnName("tenant_id");
            entity.Property(e => e.AccountName).HasColumnName("account_name").HasMaxLength(100);
            entity.Property(e => e.Iban).HasColumnName("iban").HasMaxLength(34);
            entity.Property(e => e.Balance).HasColumnName("balance").HasPrecision(15, 2);
            entity.Property(e => e.Currency).HasColumnName("currency").HasMaxLength(3);
            entity.Property(e => e.Version).IsRowVersion();

            entity.HasOne(e => e.Tenant)
                .WithMany()
                .HasForeignKey(e => e.TenantId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(e => e.Transactions)
                .WithOne(t => t.Account)
                .HasForeignKey(t => t.AccountId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Payments
        modelBuilder.Entity<Payment>(entity =>
        {
            entity.ToTable("payments");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.TenantId).HasColumnName("tenant_id");
            entity.Property(e => e.FromAccountId).HasColumnName("from_account_id");
            entity.Property(e => e.ToIban).HasColumnName("to_iban").HasMaxLength(34);
            entity.Property(e => e.Amount).HasColumnName("amount").HasPrecision(15, 2);
            entity.Property(e => e.Currency).HasColumnName("currency").HasMaxLength(3);
            entity.Property(e => e.Reference).HasColumnName("reference").HasMaxLength(100);
            entity.Property(e => e.Status).HasColumnName("status").HasMaxLength(30);
            entity.Property(e => e.CreatedById).HasColumnName("created_by");
            entity.Property(e => e.IdempotencyKey)
                .HasColumnName("idempotency_key")
                .HasMaxLength(Payment.MaxIdempotencyKeyLength);

            entity.HasIndex(e => new
            {
                e.TenantId,
                e.CreatedById,
                e.IdempotencyKey
            })
                .IsUnique()
                .HasFilter("idempotency_key IS NOT NULL")
                .HasDatabaseName("ux_payments_tenant_creator_idempotency");

            entity.Property(e => e.CreatedAt).HasColumnName("created_at");
            entity.Property(e => e.ExecutedAt).HasColumnName("executed_at");
            entity.Property(e => e.Source).HasColumnName("source").HasMaxLength(20);
            entity.Property(e => e.IdempotencyKey).HasColumnName("idempotency_key").HasMaxLength(100);
            entity.Property(e => e.Version).IsRowVersion();

            // v1 had no index on created_at, so every dashboard load scanned the table.
            entity.HasIndex(e => new { e.TenantId, e.CreatedAt });
            entity.HasIndex(e => new { e.TenantId, e.Status });
            entity.HasIndex(e => new { e.TenantId, e.CreatedById, e.IdempotencyKey })
                .IsUnique()
                .HasFilter("idempotency_key IS NOT NULL");

            entity.HasOne(e => e.Tenant)
                .WithMany()
                .HasForeignKey(e => e.TenantId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.FromAccount)
                .WithMany()
                .HasForeignKey(e => e.FromAccountId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.CreatedBy)
                .WithMany()
                .HasForeignKey(e => e.CreatedById)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasMany(e => e.ApprovalSteps)
                .WithOne(a => a.Payment)
                .HasForeignKey(a => a.PaymentId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ApprovalSteps
        modelBuilder.Entity<ApprovalStep>(entity =>
        {
            entity.ToTable("approval_steps");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.PublicId).HasColumnName("public_id");
            entity.HasIndex(e => e.PublicId).IsUnique();
            entity.Property(e => e.PaymentId).HasColumnName("payment_id");
            entity.Property(e => e.AttestantId).HasColumnName("attestant_id");
            entity.Property(e => e.StepNumber).HasColumnName("step_number");
            entity.Property(e => e.Status).HasColumnName("status").HasMaxLength(20);
            entity.Property(e => e.DecidedById).HasColumnName("decided_by");
            entity.Property(e => e.DecisionSource).HasColumnName("decision_source").HasMaxLength(30);
            entity.Property(e => e.DecidedAt).HasColumnName("decided_at");
            entity.Property(e => e.Comment).HasColumnName("comment").HasMaxLength(255);
            entity.Property(e => e.Version).IsRowVersion();

            entity.HasIndex(e => new { e.AttestantId, e.Status });
            entity.HasIndex(e => new { e.PaymentId, e.StepNumber }).IsUnique();

            entity.HasOne(e => e.Attestant)
                .WithMany()
                .HasForeignKey(e => e.AttestantId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.DecidedBy)
                .WithMany()
                .HasForeignKey(e => e.DecidedById)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // AuditEntries
        modelBuilder.Entity<AuditEntry>(entity =>
        {
            entity.ToTable("audit_entries");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.TenantId).HasColumnName("tenant_id");
            entity.Property(e => e.UserId).HasColumnName("user_id");
            entity.Property(e => e.Action).HasColumnName("action").HasMaxLength(100);
            entity.Property(e => e.EntityType).HasColumnName("entity_type").HasMaxLength(50);
            entity.Property(e => e.EntityId).HasColumnName("entity_id");
            entity.Property(e => e.Description).HasColumnName("description");
            // seed.sql stores audit timestamps as UTC wall-clock values in TIMESTAMP.
            // Send UTC values/filters as that same type, avoiding session-timezone
            // conversions in PostgreSQL comparisons. Reading preserves stored ticks.
            entity.Property(e => e.CreatedAt).HasColumnName("created_at")
                .HasColumnType("timestamp without time zone")
                .HasConversion(
                    value => DateTime.SpecifyKind(value, DateTimeKind.Unspecified),
                    value => value);
            entity.Property(e => e.Signature).HasColumnName("signature");
            entity.Property(e => e.IpAddress).HasColumnName("ip_address").HasMaxLength(45);
            entity.Property(e => e.PreviousSignature).HasColumnName("previous_signature");
            entity.HasOne<Tenant>()
                .WithMany()
                .HasForeignKey(e => e.TenantId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(e => new { e.TenantId, e.Id });
        });

        // Recipients
        modelBuilder.Entity<Recipient>(entity =>
        {
            entity.ToTable("recipients");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.TenantId).HasColumnName("tenant_id");
            entity.Property(e => e.Name).HasColumnName("name").HasMaxLength(100);
            entity.Property(e => e.Iban).HasColumnName("iban").HasMaxLength(34);
            entity.Property(e => e.CreatedById).HasColumnName("created_by");
            entity.Property(e => e.CreatedAt).HasColumnName("created_at");
            entity.HasIndex(e => new { e.TenantId, e.Iban })
                .IsUnique().HasDatabaseName("ux_recipients_tenant_iban");
            entity.HasOne<Tenant>().WithMany().HasForeignKey(e => e.TenantId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<User>().WithMany().HasForeignKey(e => e.CreatedById)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // Transactions
        modelBuilder.Entity<Transaction>(entity =>
        {
            entity.ToTable("transactions");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.AccountId).HasColumnName("account_id");
            entity.Property(e => e.Amount).HasColumnName("amount").HasPrecision(15, 2);
            entity.Property(e => e.Date).HasColumnName("date");
            entity.Property(e => e.Description).HasColumnName("description").HasMaxLength(255);
            entity.Property(e => e.TransactionType).HasColumnName("transaction_type").HasMaxLength(50);
            entity.Property(e => e.PaymentId).HasColumnName("payment_id");

            entity.HasIndex(e => new { e.AccountId, e.Date });

            entity.HasOne(e => e.Payment)
                .WithMany()
                .HasForeignKey(e => e.PaymentId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // RefreshTokens
        modelBuilder.Entity<RefreshToken>(entity =>
        {
            entity.ToTable("refresh_tokens");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.UserId).HasColumnName("user_id");
            entity.Property(e => e.TokenHash).HasColumnName("token_hash").HasMaxLength(64);
            entity.Property(e => e.FamilyId).HasColumnName("family_id");
            entity.Property(e => e.CreatedAt).HasColumnName("created_at");
            entity.Property(e => e.ExpiresAt).HasColumnName("expires_at");
            entity.Property(e => e.RevokedAt).HasColumnName("revoked_at");
            entity.Property(e => e.ReplacedByTokenHash).HasColumnName("replaced_by_token_hash").HasMaxLength(64);
            entity.Property(e => e.CreatedByIp).HasColumnName("created_by_ip").HasMaxLength(64);

            entity.HasIndex(e => e.TokenHash).IsUnique();
            entity.HasIndex(e => e.FamilyId);

            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Notifications
        modelBuilder.Entity<Notification>(entity =>
        {
            entity.ToTable("notifications");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.TenantId).HasColumnName("tenant_id");
            entity.Property(e => e.RecipientUserId).HasColumnName("recipient_user_id");
            entity.Property(e => e.Type).HasColumnName("type").HasMaxLength(50);
            entity.Property(e => e.Title).HasColumnName("title").HasMaxLength(200);
            entity.Property(e => e.Message).HasColumnName("message");
            entity.Property(e => e.PaymentId).HasColumnName("payment_id");
            entity.Property(e => e.CreatedAt).HasColumnName("created_at");
            entity.Property(e => e.ReadAt).HasColumnName("read_at");
            entity.Property(e => e.EmailStatus).HasColumnName("email_status").HasMaxLength(20);
            entity.Property(e => e.EmailAttempts).HasColumnName("email_attempts");
            entity.Property(e => e.EmailLastError).HasColumnName("email_last_error");
            entity.Property(e => e.EmailSentAt).HasColumnName("email_sent_at");

            entity.HasIndex(e => new { e.RecipientUserId, e.CreatedAt });
            entity.HasIndex(e => e.EmailStatus);

            entity.HasOne(e => e.RecipientUser)
                .WithMany()
                .HasForeignKey(e => e.RecipientUserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne<Payment>()
                .WithMany()
                .HasForeignKey(e => e.PaymentId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // SystemSettings
        modelBuilder.Entity<SystemSetting>(entity =>
        {
            entity.ToTable("system_settings");
            entity.HasKey(e => e.Key);
            entity.Property(e => e.Key).HasColumnName("key").HasMaxLength(100);
            entity.Property(e => e.Value).HasColumnName("value");
        });
    }
}
