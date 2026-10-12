using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.Models;

namespace SebPortal.Api.Repositories;

public class PaymentQueryRepository(SebDbContext db)
{
    public Task<Payment?> GetPaymentAsync(int paymentId, int tenantId) =>
        db.Payments
            .AsNoTracking()
            .Where(payment => payment.Id == paymentId && payment.TenantId == tenantId)
            .Include(payment => payment.FromAccount)
            .Include(payment => payment.CreatedBy)
            .Include(payment => payment.ApprovalSteps)
                .ThenInclude(step => step.Attestant)
            .Include(payment => payment.ApprovalSteps)
                .ThenInclude(step => step.DecidedBy)
            .FirstOrDefaultAsync();
}
