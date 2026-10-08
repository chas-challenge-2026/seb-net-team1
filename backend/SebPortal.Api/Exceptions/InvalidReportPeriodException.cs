namespace SebPortal.Api.Exceptions;

public class InvalidReportPeriodException(string userMessage)
    : BadRequestException(userMessage);
