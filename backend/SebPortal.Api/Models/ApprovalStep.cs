namespace SebPortal.Api.Models
{
    public class ApprovalStep
    {
        public int Id { get; set; }
        public int PaymentId { get; set; }
        public int AttestantId { get; set; }
        public int StepNumber { get; set; }
        public string Status { get; set; }
        public DateTime DecidedAt { get; set; }
        public string Comment { get; set; }
    }
}
