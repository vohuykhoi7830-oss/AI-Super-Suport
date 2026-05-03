var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllersWithViews();
builder.Services.AddHttpClient();

// Đọc PORT từ Railway và set URL trước khi Build()
var port = Environment.GetEnvironmentVariable("PORT") ?? "8080";
builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseStaticFiles();
app.UseRouting();
app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

// Health check
app.MapGet("/api/health", () => Results.Json(new
{
    status = "ok",
    hasKey = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("GROQ_API_KEY")),
    time = DateTime.UtcNow.ToString("o")
}));

// Proxy endpoint — nhận request từ site.js và chuyển sang Groq API
app.MapPost("/api/chat", async (HttpContext ctx, IHttpClientFactory factory) =>
{
    var apiKey = Environment.GetEnvironmentVariable("GROQ_API_KEY") ?? "";
    if (string.IsNullOrEmpty(apiKey))
        return Results.Json(new { error = "GROQ_API_KEY not configured" }, statusCode: 500);

    // Đọc body từ request
    using var reader = new StreamReader(ctx.Request.Body);
    var bodyStr = await reader.ReadToEndAsync();
    var body = System.Text.Json.JsonDocument.Parse(bodyStr).RootElement;

    // Lấy messages và system từ request
    var messages = new System.Text.Json.Nodes.JsonArray();
    
    // Thêm system message nếu có (dùng role "user" prefix thay vì "system" để tránh lỗi)
    string systemPrompt = "";
    if (body.TryGetProperty("system", out var sysProp) && sysProp.GetString() is { Length: > 0 } sys)
        systemPrompt = sys;

    if (body.TryGetProperty("messages", out var msgsProp))
    {
        foreach (var msg in msgsProp.EnumerateArray())
        {
            var role = msg.GetProperty("role").GetString();
            var content = msg.GetProperty("content").GetString();
            
            // Nếu là message đầu tiên của user và có system prompt, ghép vào
            if (role == "user" && !string.IsNullOrEmpty(systemPrompt))
            {
                content = systemPrompt + "\n\n" + content;
                systemPrompt = ""; // chỉ ghép 1 lần
            }
            
            messages.Add(new System.Text.Json.Nodes.JsonObject
            {
                ["role"] = role,
                ["content"] = content
            });
        }
    }

    var model = "llama-3.3-70b-versatile";
    if (body.TryGetProperty("model", out var modelProp))
        model = modelProp.GetString() ?? model;

    var maxTokens = 1500;
    if (body.TryGetProperty("max_tokens", out var tokenProp))
        maxTokens = tokenProp.GetInt32();

    var groqBody = new System.Text.Json.Nodes.JsonObject
    {
        ["model"] = model,
        ["max_tokens"] = maxTokens,
        ["messages"] = messages
    };

    var client = factory.CreateClient();
    client.DefaultRequestHeaders.Add("Authorization", $"Bearer {apiKey}");

    var response = await client.PostAsync(
        "https://api.groq.com/openai/v1/chat/completions",
        new StringContent(groqBody.ToJsonString(), System.Text.Encoding.UTF8, "application/json")
    );

    var responseStr = await response.Content.ReadAsStringAsync();
    return Results.Content(responseStr, "application/json");
});

app.Run();
