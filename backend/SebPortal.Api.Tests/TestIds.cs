namespace SebPortal.Api.Tests;

/// <summary>
/// Approval steps are found by a random public id (a Guid), but the tests read much
/// better with the plain numbers 501, 502 and so on. This turns a number into the same
/// Guid every time (501 always gives 00000000-01f5-0000-0000-000000000000), so a
/// test can seed a step with Step(501) and later call the API with Step(501).
/// </summary>
public static class TestIds
{
    public static Guid Step(int number) => new(number, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
}