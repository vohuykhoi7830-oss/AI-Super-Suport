var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllersWithViews();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseRouting();
app.UseAuthorization();
app.MapStaticAssets();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}")
    .WithStaticAssets();

// ─── /api/health ───────────────────────────────────────────
app.MapGet("/api/health", () => Results.Json(new
{
    status = "ok",
    hasKey = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("GROQ_API_KEY")),
    time   = DateTime.UtcNow.ToString("o")
}));

// ─── /api/chat (Text AI) ───────────────────────────────────
app.MapPost("/api/chat", async (HttpContext ctx) =>
{
    var groqKey = Environment.GetEnvironmentVariable("GROQ_API_KEY");
    if (string.IsNullOrEmpty(groqKey))
    {
        ctx.Response.StatusCode = 500;
        await ctx.Response.WriteAsync("{\"error\":\"GROQ_API_KEY not set in environment variables\"}");
        return;
    }

    using var reader = new StreamReader(ctx.Request.Body);
    var body = await reader.ReadToEndAsync();

    using var http = new HttpClient();
    http.DefaultRequestHeaders.Add("Authorization", $"Bearer {groqKey}");

    var response = await http.PostAsync(
        "https://api.groq.com/openai/v1/chat/completions",
        new StringContent(body, System.Text.Encoding.UTF8, "application/json")
    );

    var result = await response.Content.ReadAsStringAsync();
    ctx.Response.ContentType = "application/json";
    await ctx.Response.WriteAsync(result);
});

// ─── /api/vision (Image AI) ────────────────────────────────
app.MapPost("/api/vision", async (HttpContext ctx) =>
{
    var groqKey = Environment.GetEnvironmentVariable("GROQ_API_KEY");
    if (string.IsNullOrEmpty(groqKey))
    {
        ctx.Response.StatusCode = 500;
        await ctx.Response.WriteAsync("{\"error\":\"GROQ_API_KEY not set in environment variables\"}");
        return;
    }

    using var reader = new StreamReader(ctx.Request.Body);
    var body = await reader.ReadToEndAsync();

    using var http = new HttpClient();
    http.DefaultRequestHeaders.Add("Authorization", $"Bearer {groqKey}");

    var response = await http.PostAsync(
        "https://api.groq.com/openai/v1/chat/completions",
        new StringContent(body, System.Text.Encoding.UTF8, "application/json")
    );

    var result = await response.Content.ReadAsStringAsync();
    ctx.Response.ContentType = "application/json";
    await ctx.Response.WriteAsync(result);
});

app.Run();