// ═══════════════════════════════════════════════════════
//  AI SUPPER SUPPORT — RAILWAY PROXY SERVER
//  Key an toàn: không lộ trên GitHub
// ═══════════════════════════════════════════════════════

const express = require('express');
const cors    = require('cors');
const fetch   = (...a) => import('node-fetch').then(({default:f}) => f(...a));
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── SECRETS — đặt trong Railway Variables, không trong code ───
const GROQ_KEY = process.env.GROQ_API_KEY || '';
const FIREBASE_CONFIG = {
    apiKey:            process.env.FIREBASE_API_KEY            || '',
    authDomain:        process.env.FIREBASE_AUTH_DOMAIN        || '',
    databaseURL:       process.env.FIREBASE_DATABASE_URL       || '',
    projectId:         process.env.FIREBASE_PROJECT_ID         || '',
    storageBucket:     process.env.FIREBASE_STORAGE_BUCKET     || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID|| '',
    appId:             process.env.FIREBASE_APP_ID             || ''
};

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '20mb' }));

// ─── Serve site.js trực tiếp từ root ───
app.get('/js/site.js', (req, res) => {
    const p = path.join(__dirname, 'site.js');
    if (!fs.existsSync(p)) return res.status(404).send('site.js not found');
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(p);
});

// ─── Serve trang chính, inject Firebase config vào <head> ───
app.get('/', (req, res) => {
    // Tìm file HTML theo thứ tự ưu tiên
    const candidates = [
        path.join(__dirname, 'index.html'),
        path.join(__dirname, 'Index.cshtml'),
        path.join(__dirname, 'wwwroot', 'index.html'),
        path.join(__dirname, 'Views', 'Home', 'Index.cshtml'),
    ];

    const filePath = candidates.find(p => fs.existsSync(p));
    if (!filePath) {
        return res.status(404).send('<h2>❌ Không tìm thấy file HTML. Đặt index.html hoặc Index.cshtml cùng thư mục với server.js</h2>');
    }

    let html = fs.readFileSync(filePath, 'utf8');

    // Inject Firebase config + Proxy URL vào ngay sau <head>
    const injection = `<script>
window.FIREBASE_CONFIG = ${JSON.stringify(FIREBASE_CONFIG)};
window.AI_PROXY_URL = '';
</script>`;
    html = html.replace('<head>', '<head>' + injection);

    // Fix đường dẫn ASP.NET ~/js/site.js → /js/site.js
    html = html.replace(/src="~\/js\/site\.js"/g, 'src="/js/site.js"');
    html = html.replace(/src='~\/js\/site\.js'/g, "src='/js/site.js'");

    // Fix @@ → @ cho Razor CSS syntax (@keyframes, @media, v.v.)
    html = html.replace(/@@keyframes/g, '@keyframes');
    html = html.replace(/@@font-face/g, '@font-face');
    html = html.replace(/@@media/g, '@media');
    html = html.replace(/@@layer/g, '@layer');

    res.send(html);
});

// ─── Serve static files (wwwroot nếu có) ───
app.use(express.static(path.join(__dirname, 'wwwroot')));
app.use(express.static(__dirname));

// ═══ PROXY ENDPOINTS ════════════════════════════════════

// Text chat
app.post('/api/chat', async (req, res) => {
    if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set in Railway Variables' });
    try {
        const { messages, model, max_tokens, system } = req.body;
        const msgs = [];
        if (system) msgs.push({ role: 'system', content: system });
        msgs.push(...(messages || []));
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
            body: JSON.stringify({ model: model || 'llama-3.3-70b-versatile', max_tokens: max_tokens || 1500, messages: msgs })
        });
        const data = await r.json();
        res.json(data);
    } catch (e) { res.status(500).json({ error: { message: e.message } }); }
});

// Vision (ảnh)
app.post('/api/vision', async (req, res) => {
    if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set in Railway Variables' });
    try {
        const { messages, model, max_tokens } = req.body;
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
            body: JSON.stringify({ model: model || 'meta-llama/llama-4-scout-17b-16e-instruct', max_tokens: max_tokens || 2000, messages: messages || [] })
        });
        const data = await r.json();
        res.json(data);
    } catch (e) { res.status(500).json({ error: { message: e.message } }); }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        hasGroqKey: !!GROQ_KEY,
        hasKey: !!GROQ_KEY,
        hasFirebase: !!FIREBASE_CONFIG.apiKey,
        time: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`   Groq Key:    ${GROQ_KEY ? '✅' : '❌ MISSING — set GROQ_API_KEY in Railway Variables'}`);
    console.log(`   Firebase:    ${FIREBASE_CONFIG.apiKey ? '✅' : '❌ MISSING — set FIREBASE_API_KEY etc. in Railway Variables'}`);
});

