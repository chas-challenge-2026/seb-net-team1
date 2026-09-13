using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Models;

namespace SebPortal.Api.Data;

public class SebDbContext : DbContext
{
    public SebDbContext(DbContextOptions<SebDbContext> options) : base(options)
    {
    }

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<ApprovalStep> ApprovalSteps => Set<ApprovalStep>();
    public DbSet<AuditEntry> AuditEntries => Set<AuditEntry>();
    public DbSet<Transaction> Transactions => Set<Transaction>();

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
            entity.Property(e => e.PasswordHash).HasColumnName("password_md5").HasMaxLength(255);
            entity.Property(e => e.Role).HasColumnName("role").HasMaxLength(20);

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
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.TenantId).HasColumnName("tenant_id");
            entity.Property(e => e.AccountName).HasColumnName("account_name").HasMaxLength(100);
            entity.Property(e => e.Iban).HasColumnName("iban").HasMaxLength(34);
            entity.Property(e => e.Balance).HasColumnName("balance").HasPrecision(15, 2);
            entity.Property(e => e.Currency).HasColumnName("currency").HasMaxLength(3);

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
            entity.Property(e => e.CreatedAt).HasColumnName("created_at");
            entity.Property(e => e.ExecutedAt).HasColumnName("executed_at");

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
            entity.Property(e => e.PaymentId).HasColumnName("payment_id");
            entity.Property(e => e.AttestantId).HasColumnName("attestant_id");
            entity.Property(e => e.StepNumber).HasColumnName("step_number");
            entity.Property(e => e.Status).HasColumnName("status").HasMaxLength(20);
            entity.Property(e => e.DecidedAt).HasColumnName("decided_at");
            entity.Property(e => e.Comment).HasColumnName("comment").HasMaxLength(255);

            entity.HasOne(e => e.Attestant)
                .WithMany()
                .HasForeignKey(e => e.AttestantId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // AuditEntries
        modelBuilder.Entity<AuditEntry>(entity =>
        {
            entity.ToTable("audit_entries");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.UserId).HasColumnName("user_id");
            entity.Property(e => e.Action).HasColumnName("action").HasMaxLength(100);
            entity.Property(e => e.EntityType).HasColumnName("entity_type").HasMaxLength(50);
            entity.Property(e => e.EntityId).HasColumnName("entity_id");
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.CreatedAt).HasColumnName("created_at");

            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
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
        });
    }
}

