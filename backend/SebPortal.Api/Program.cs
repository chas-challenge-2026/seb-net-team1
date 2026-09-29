using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;
using SebPortal.Api.Auditing;
using SebPortal.Api.Auth;
using SebPortal.Api.Batch;
using SebPortal.Api.Data;
using SebPortal.Api.Health;
using SebPortal.Api.Middleware;
using SebPortal.Api.Notifications;
using SebPortal.Api.Options;
using SebPortal.Api.Repositories;
using SebPortal.Api.Services;
using SebPortal.Api.Validation;
using Serilog;
using Serilog.Formatting.Compact;

var builder = WebApplication.CreateBuilder(args);

// Structured logging with Serilog: readable in development, JSON everywhere else.
builder.Host.UseSerilog((context, services, logger) =>
{
    logger
        .ReadFrom.Configuration(context.Configuration)
        .ReadFrom.Services(services)
        .Enrich.FromLogContext();

    if (context.HostingEnvironment.IsDevelopment())
    {
        logger.WriteTo.Console(outputTemplate:
            "[{Timestamp:HH:mm:ss} {Level:u3}] {SourceContext}: {Message:lj}{NewLine}{Exception}");
    }
    else
    {
        logger.WriteTo.Console(new RenderedCompactJsonFormatter());
    }
});

// Database. The connection string only comes from configuration (appsettings or the
// ConnectionStrings__DefaultConnection environment variable), never from code (BUG-010).
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddScoped<AuditChainInterceptor>();
builder.Services.AddScoped<NotificationOutboxInterceptor>();
builder.Services.AddDbContext<SebDbContext>(options =>
{
    if (!string.IsNullOrEmpty(connectionString))
    {
        options.UseNpgsql(connectionString);
    }
});
builder.Services.AddScoped<UnitOfWork>();

builder.Services.AddExceptionHandler<AppExceptionHandler>();
builder.Services.AddProblemDetails();

// Configurable business rules and settings.
builder.Services.Configure<PaymentRulesOptions>(builder.Configuration.GetSection(PaymentRulesOptions.SectionName));
builder.Services.Configure<SmtpOptions>(builder.Configuration.GetSection(SmtpOptions.SectionName));
builder.Services.Configure<AuditOptions>(builder.Configuration.GetSection(AuditOptions.SectionName));
builder.Services.Configure<BatchOptions>(builder.Configuration.GetSection(BatchOptions.SectionName));
builder.Services.Configure<AppOptions>(builder.Configuration.GetSection(AppOptions.SectionName));

// Auth
var jwtSettings = JwtSettings.FromConfiguration(builder.Configuration);
builder.Services.AddSingleton(jwtSettings);
builder.Services.AddSingleton(new JwtTokenService(jwtSettings));
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<UserService>();
builder.Services.AddScoped<PasswordHasher>();
builder.Services.AddScoped<UserRepository>();
builder.Services.AddScoped<RefreshTokenRepository>();

// Payments, approvals and everything around them
builder.Services.AddScoped<PaymentRepository>();
builder.Services.AddScoped<PaymentService>();
builder.Services.AddScoped<PaymentQueryService>();
builder.Services.AddScoped<BatchPaymentService>();
builder.Services.AddScoped<ApprovalRepository>();
builder.Services.AddScoped<ApprovalService>();
builder.Services.AddScoped<ApprovalAssignmentService>();
builder.Services.AddScoped<DashboardRepository>();
builder.Services.AddScoped<DashboardService>();
builder.Services.AddScoped<AccountService>();
builder.Services.AddScoped<ReportService>();
builder.Services.AddScoped<AuditLogRepository>();
builder.Services.AddScoped<AuditLogService>();
builder.Services.AddSingleton<AuditSigningKeyProvider>();

// Native modules with managed fallbacks (see native/ and Native/).
builder.Services.AddSingleton<IIbanValidator, IbanValidator>();
builder.Services.AddSingleton<ICsvPaymentParser, CsvPaymentParser>();

// Notifications: saved with the business change, e-mailed by a background worker.
builder.Services.AddScoped<NotificationService>();
builder.Services.AddScoped<NotificationDeliveryService>();
builder.Services.AddSingleton<NotificationQueue>();
builder.Services.AddSingleton<IEmailSender, MailKitEmailSender>();
builder.Services.AddHostedService<NotificationDispatcher>();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = jwtSettings.ValidationParameters();

        // Answer 401/403 with the same ProblemDetails shape as every other error.
        options.Events = new JwtBearerEvents
        {
            OnChallenge = async context =>
            {
                context.HandleResponse();
                await WriteProblemAsync(context.HttpContext, StatusCodes.Status401Unauthorized, "Unauthorized",
                    "Åtkomst nekad. Logga in igen.");
            },
            OnForbidden = context => WriteProblemAsync(context.HttpContext, StatusCodes.Status403Forbidden, "Forbidden",
                "Du har inte behörighet till den här funktionen.")
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddAuthRateLimiting(builder.Configuration);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo { Title = "SEB Företagsbetalningar API", Version = "v2" });

    var bearer = new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Access token från POST /api/auth/login",
        Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
    };
    options.AddSecurityDefinition("Bearer", bearer);
    options.AddSecurityRequirement(new OpenApiSecurityRequirement { [bearer] = [] });
});

builder.Services
    .AddHealthChecks()
    .AddDbContextCheck<SebDbContext>("database")
    .AddCheck<AuditChainHealthCheck>("audit_chain");
builder.Services.AddSingleton<AuditChainHealthCheck>();

// Only needed when the frontend runs on another origin with VITE_API_URL; the Vite
// dev server proxies /api, and in Docker the API serves the frontend itself.
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy
            .WithOrigins("http://localhost:3000", "http://localhost:5173")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

// Behind the platform's reverse proxy: use the real client address (rate limiting)
// and scheme.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

var app = builder.Build();

if (jwtSettings.UsesGeneratedKey)
{
    app.Logger.LogWarning("Jwt:Key is not configured; using a random key for this process. " +
                          "Set Jwt__Key so access tokens survive restarts.");
}

await DatabaseInitializer.InitializeAsync(app.Services);

app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseSerilogRequestLogging();
app.UseMiddleware<SecurityHeadersMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowFrontend");
app.UseRateLimiter();

app.UseAuthentication();
app.UseAuthorization();

// The built frontend (wwwroot) only exists in the Docker image; in development Vite serves it.
if (Directory.Exists(app.Environment.WebRootPath))
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
}

app.MapControllers();

app.MapHealthChecks("/health", new HealthCheckOptions { ResponseWriter = HealthResponseWriter.WriteAsync });

// Unknown API routes get a JSON 404 instead of the frontend's index.html.
app.MapFallback("/api/{**path}", (HttpContext context) =>
    Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "NotFound", detail: "Resursen finns inte."));
app.MapFallbackToFile("index.html");

app.Run();

static Task WriteProblemAsync(HttpContext context, int statusCode, string title, string detail)
{
    context.Response.StatusCode = statusCode;
    return context.Response.WriteAsJsonAsync(
        new ProblemDetails { Status = statusCode, Title = title, Detail = detail },
        (JsonSerializerOptions?)null,
        "application/problem+json");
}

public partial class Program;
