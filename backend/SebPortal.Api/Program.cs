using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SebPortal.Api.Data;
using SebPortal.Api.Repositories;
using SebPortal.Api.Services;
using SebPortal.Api.Auth;
using SebPortal.Api.Middleware;
using SebPortal.Api.Options;
using SebPortal.Api.Signing;
using System.Net;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

// Both signing and validation use the same keys until the API is restarted.
var jwtConfiguration = JwtConfiguration.FromConfiguration(builder.Configuration);
builder.Services.AddSingleton(jwtConfiguration);

// Add database context
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");

builder.Services.AddDbContext<SebDbContext>(options =>
{
    if (!string.IsNullOrEmpty(connectionString))
    {
        options.UseNpgsql(connectionString);
    }
});

builder.Services.AddExceptionHandler<AppExceptionHandler>();
builder.Services.AddProblemDetails();

// Only configured proxies (and the framework's loopback defaults) may supply the HTTPS scheme
// and the client's IP address. With no proxies configured, X-Forwarded-For is ignored.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedFor;
    foreach (var address in builder.Configuration.GetSection("ReverseProxy:KnownProxies").Get<string[]>() ?? [])
    {
        options.KnownProxies.Add(IPAddress.Parse(address));
    }
});

// Limits login attempts per client IP address, so passwords cannot be tried at full speed.
// A sliding window counts the attempts made during the last minute, so there is no moment
// (like the start of a new minute) where the counter resets and a burst gets through.
// The limit is read from configuration so it can be raised in tests or for a demo.
var loginPermitLimit = builder.Configuration.GetValue("RateLimiting:LoginPermitLimit", 10);
var loginWindow = TimeSpan.FromMinutes(1);
const int loginWindowSegments = 6;

builder.Services.AddRateLimiter(options =>
{
    options.AddPolicy("login", httpContext =>
        RateLimitPartition.GetSlidingWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new SlidingWindowRateLimiterOptions
            {
                PermitLimit = loginPermitLimit,
                Window = loginWindow,
                SegmentsPerWindow = loginWindowSegments,
                QueueLimit = 0
            }));

    options.OnRejected = async (context, cancellationToken) =>
    {
        var response = context.HttpContext.Response;
        response.StatusCode = StatusCodes.Status429TooManyRequests;

        // The sliding window limiter gives no retry time of its own. One segment is the
        // earliest moment a permit can be freed up, so that is what we tell the client.
        var retryAfter = context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var fromLimiter)
            ? fromLimiter
            : loginWindow / loginWindowSegments;
        response.Headers.RetryAfter = ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString();

        var problemDetails = context.HttpContext.RequestServices
            .GetRequiredService<IProblemDetailsService>();

        await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context.HttpContext,
            ProblemDetails = new ProblemDetails
            {
                Status = StatusCodes.Status429TooManyRequests,
                Title = "TooManyRequests",
                Detail = "För många inloggningsförsök. Vänta en minut och försök igen."
            }
        });
    };
});

builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.Cookie.Name = "SebPortal.Csrf";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.Path = "/api";
    options.Cookie.SecurePolicy = AuthCookie.SecurePolicy(builder.Configuration);
});

// Register configurable payment business rules.
builder.Services.Configure<PaymentRulesOptions>(
    builder.Configuration.GetSection(PaymentRulesOptions.SectionName));

// Services
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<JwtTokenService>();

builder.Services.AddScoped<UserRepository>();
builder.Services.AddScoped<PasswordHasher>();

builder.Services.AddScoped<PaymentRepository>();
builder.Services.AddScoped<PaymentService>();
builder.Services.AddScoped<DashboardRepository>();
builder.Services.AddScoped<DashboardService>();
builder.Services.AddScoped<ReportRepository>();
builder.Services.AddScoped<ReportService>();

builder.Services.AddScoped<ApprovalRepository>();
builder.Services.AddScoped<ApprovalService>();
builder.Services.AddScoped<AuditRepository>();
builder.Services.AddScoped<AuditService>();

// AuditLockProvider holds one lock per tenant across the whole app, it has to be
// a singleton or two requests would each get their own lock and never actually
// block each other. IAuditSigner is stateless, safe as a singleton too.
//
// UnsignedPlaceholderAuditSigner is NOT real signing, it's a plain unkeyed hash
// that stands in until Emil's part is ready. I will swap this one
// registration for his implementation once it lands, nothing else changes. -HB
builder.Services.AddSingleton<AuditLockProvider>();
builder.Services.AddSingleton<IAuditSigner, UnsignedPlaceholderAuditSigner>();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                // An explicit header takes precedence, including an invalid one.
                if (!context.Request.Headers.ContainsKey("Authorization"))
                {
                    context.Token = context.Request.Cookies[AuthCookie.Name];
                }
                return Task.CompletedTask;
            }
        };
        options.TokenValidationParameters = jwtConfiguration.CreateValidationParameters();
    });

builder.Services.AddAuthorization();

builder.Services.AddControllers(options => options.Filters.Add<CookieAntiforgeryFilter>());
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy
            .WithOrigins(
                "http://localhost:5173",
                "http://localhost:5174")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();

app.UseForwardedHeaders();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseExceptionHandler();

app.UseCors("AllowFrontend");

app.UseRateLimiter();

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.UseStaticFiles();
app.MapFallbackToFile("index.html");

app.Run();

public partial class Program;
