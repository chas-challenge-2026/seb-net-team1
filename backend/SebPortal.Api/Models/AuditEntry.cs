namespace SebPortal.Api.Models
{
    public class AuditEntry
    {
        public int Id { get; set; }
        public int userId { get; set; }
        public int PaymentId { get; set; }
        public string Action{ get; set; }
        public string EntityType { get; set; }
        public string EntityId { get; set; }
        public string Description { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
