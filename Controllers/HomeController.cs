using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using knowlegle.Models;
using System.Net.Http;
using System.Text;
using Newtonsoft.Json;

namespace knowlegle.Controllers;

public class HomeController : Controller
{
    // LẤY API KEY TẠI: https://aistudio.google.com/app/apikey
    private readonly string _geminiApiKey = "YOUR_GEMINI_API_KEY_HERE";
    private readonly string _geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

    public IActionResult Index() => View();

    [HttpPost]
    public async Task<IActionResult> UploadData(string vocab, IFormFile postedFile)
    {
        string aiResult = "";

        // 1. Xử lý lưu File (Hình ảnh/Voice/Tài liệu)
        if (postedFile != null && postedFile.Length > 0)
        {
            var uploadsPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads");
            if (!Directory.Exists(uploadsPath)) Directory.CreateDirectory(uploadsPath);

            var filePath = Path.Combine(uploadsPath, postedFile.FileName);
            using (var stream = new FileStream(filePath, FileMode.Create))
            {
                await postedFile.CopyToAsync(stream);
            }
        }

        // 2. Gửi yêu cầu đến Gemini AI để hệ thống hóa kiến thức
        try 
        {
            using (var client = new HttpClient())
            {
                var prompt = $"Dựa trên dữ liệu: '{vocab}'. Hãy hệ thống hóa kiến thức này một cách nhanh chóng, đưa ra từ vựng quan trọng và gợi ý bài tập thực hành theo phong cách IELTS.";
                
                var payload = new {
                    contents = new[] {
                        new { parts = new[] { new { text = prompt } } }
                    }
                };

                var json = JsonConvert.SerializeObject(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await client.PostAsync($"{_geminiUrl}?key={_geminiApiKey}", content);
                var responseString = await response.Content.ReadAsStringAsync();
                
                // Giải mã JSON an toàn (Đã fix lỗi gạch vàng CS8600)
                dynamic? data = JsonConvert.DeserializeObject<dynamic>(responseString);
                aiResult = data?.candidates?[0]?.content?.parts?[0]?.text ?? "AI không phản hồi, kiểm tra lại API Key.";
            }
        }
        catch (Exception ex)
        {
            aiResult = "Lỗi hệ thống: " + ex.Message;
        }

        ViewBag.AIResponse = aiResult;
        return View("Index");
    }
}