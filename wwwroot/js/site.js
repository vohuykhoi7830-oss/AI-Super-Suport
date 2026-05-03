// ═══════════════════════════════════════════
//  AI SUPPER SUPPORT — CORE ENGINE
//  Firebase Realtime Database Integration
// ═══════════════════════════════════════════

// ─── FIREBASE CONFIG ───
// ⚠️ THAY THẾ ĐOẠN NÀY BẰNG CONFIG CỦA BẠN TỪ FIREBASE CONSOLE
// Firebase SDK được load qua <script> tags trong Index.cshtml (compat version — không cần import)
// ─── FIREBASE CONFIG ───
// Được load từ window.FIREBASE_CONFIG (inject bởi server)
// Không hardcode key trong code — an toàn với GitHub
const firebaseConfig = window.FIREBASE_CONFIG || {
    apiKey: "",
    authDomain: "",
    databaseURL: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ─── FIREBASE HELPERS ───
async function fbGet(path) {
    try {
        const snap = await db.ref(path).get();
        return snap.exists() ? snap.val() : null;
    } catch(e) { console.error('fbGet error', path, e); return null; }
}
async function fbSet(path, value) {
    try { await db.ref(path).set(value); return true; }
    catch(e) { console.error('fbSet error', path, e); return false; }
}
async function fbRemove(path) {
    try { await db.ref(path).remove(); return true; }
    catch(e) { console.error('fbRemove error', path, e); return false; }
}
async function fbPush(path, value) {
    try { await db.ref(path).push(value); return true; }
    catch(e) { console.error('fbPush error', path, e); return false; }
}

// ═══════════════════════════════════════════
//  STATE (vocab, files vẫn dùng localStorage — riêng tư mỗi user)
// ═══════════════════════════════════════════
const S = {
    words: JSON.parse(localStorage.getItem('ass_words') || '[]'),
    files: JSON.parse(localStorage.getItem('ass_files') || '[]'),
    docText: "",
    streak: parseInt(localStorage.getItem('ass_streak') || '0'),
    lastVisit: localStorage.getItem('ass_last_visit'),
    dailyCount: parseInt(sessionStorage.getItem('ass_daily') || '0'),
    apiKey: 'PROXY', // Key stored on Railway server, not in browser
    proxyUrl: '', // Auto-detected: same origin or set via window.AI_PROXY_URL
    skillLevel: 'Easy',
    skillSrc: 'ai',
    selectedSkill: null,
    quizData: [], quizAnswers: [], quizIndex: 0
};

function save() {
    localStorage.setItem('ass_words', JSON.stringify(S.words));
    localStorage.setItem('ass_files', JSON.stringify(S.files));
}

// ─── API ENGINE — PROXY MODE (key stays on Railway server) ───
function getProxyBase() {
    if (window.AI_PROXY_URL) return window.AI_PROXY_URL.replace(/\/$/, '');
    // Same-origin when deployed on Railway
    return window.location.origin;
}

async function callAI(prompt, system = '') {
    try {
        const messages = [{ role: 'user', content: prompt }];
        const r = await fetch(getProxyBase() + '/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, system, model: 'llama-3.3-70b-versatile', max_tokens: 1500 })
        });
        const d = await r.json();
        if (d.choices && d.choices[0]) return d.choices[0].message.content.replace(/```[\w]*\n?/g,'').replace(/```/g,'').trim();
        if (d.error) return `Lỗi AI: ${typeof d.error === 'string' ? d.error : d.error.message}`;
        return 'AI không trả về kết quả.';
    } catch (e) { return `Lỗi kết nối proxy: ${e.message}`; }
}

// ─── MODAL ───
function showModal() { document.getElementById('api-modal').classList.remove('hidden'); }
function closeModal() { document.getElementById('api-modal').classList.add('hidden'); }
// saveApiKey: no longer needed — key is on server
function saveApiKey() { closeModal(); }
function updateStatus(on) {
    const user = getCurrentUser();
    document.querySelectorAll('.ai-badge').forEach(b => {
        if (user) {
            b.innerHTML = `<i class="fa-solid fa-microchip" style="margin-right:6px;font-size:10px"></i>${user.displayName} <span style="opacity:0.6;font-size:10px;margin-left:4px">${user.role}${on?' · <span style="color:var(--green)">Online</span>':''}</span>`;
        } else {
            b.textContent = on ? '✦ AI Online' : '○ Not connected';
        }
        b.style.color = on ? 'var(--green)' : 'var(--text3)';
    });
}

// ─── NAV ───
function goTo(id, e) {
    const ev = e || event;
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('s-' + id).classList.add('active');
    if (ev && ev.currentTarget) ev.currentTarget.classList.add('active');
    if (id === 'vocab') renderVocab();
    if (id === 'files') { renderFiles(); updateHomeStats(); }
    if (id === 'translate') updateHomeStats();
    if (id === 'ielts') { switchIeltsMode('skills', document.getElementById('ielts-mode-skills')); }
    if (id === 'toeic') { switchToeicMode('skills', document.getElementById('toeic-mode-skills')); }
}

// ─── 1. TRANSLATOR ───
let transTimer;
function autoTranslate() {
    clearTimeout(transTimer);
    const val = document.getElementById('trans-input').value.trim();
    if (!val) return;
    transTimer = setTimeout(async () => {
        const out = document.getElementById('trans-result');
        out.innerHTML = '<span class="spinner"></span> Translating...';
        const res = await callAI(
            `Auto-detect the language and translate. If Vietnamese → translate to English. If English → translate to Vietnamese. If other language → translate to Vietnamese.\n\nAfter the translation, add a short analysis: difficult words, useful phrases, grammar notes (if any).\n\nText: "${val}"`,
            'You are a professional translator. Translate accurately and naturally.'
        );
        out.textContent = res;
        S.dailyCount++;
        sessionStorage.setItem('ass_daily', S.dailyCount);
        document.getElementById('daily-count').textContent = S.dailyCount;
        if (S.dailyCount % 5 === 1) logActivity('User translated text (session count: ' + S.dailyCount + ')', 'info');
    }, 600);
}
function setTranslate(t) { document.getElementById('trans-input').value = t; autoTranslate(); }

function clearTrans() { document.getElementById('trans-input').value = ''; document.getElementById('trans-result').textContent = 'Translation will appear here as you type...'; }

// ─── TAB SWITCHER ───
function switchTransTab(tab) {
    const isText = tab === 'text';
    document.getElementById('trans-tab-text').style.display  = isText ? 'block' : 'none';
    document.getElementById('trans-tab-image').style.display = isText ? 'none'  : 'block';
    const chips = document.getElementById('trans-quick-chips');
    if (chips) chips.style.display = isText ? 'flex' : 'none';

    const btnText = document.getElementById('tab-text-btn');
    const btnImg  = document.getElementById('tab-img-btn');
    if (btnText) {
        btnText.style.background   = isText ? 'rgba(59,130,246,0.15)' : 'transparent';
        btnText.style.borderColor  = isText ? 'var(--accent)' : 'var(--border2)';
        btnText.style.color        = isText ? 'var(--text)' : 'var(--text2)';
    }
    if (btnImg) {
        btnImg.style.background    = !isText ? 'rgba(139,92,246,0.15)' : 'transparent';
        btnImg.style.borderColor   = !isText ? 'var(--accent2)' : 'var(--border2)';
        btnImg.style.color         = !isText ? 'var(--text)' : 'var(--text2)';
    }
}

// ─── IMAGE TRANSLATION ───
function handleImgDrop(e) {
    e.preventDefault();
    document.getElementById('img-drop-zone').style.borderColor = 'rgba(59,130,246,0.3)';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) processImageFile(file);
}

function translateImage(e) {
    const file = e.target.files[0];
    if (file) processImageFile(file);
    e.target.value = '';
}

function clearImgTrans() {
    document.getElementById('img-preview-wrap').style.display = 'none';
    document.getElementById('img-drop-zone').style.display = 'flex';
    document.getElementById('trans-result').textContent = 'Translation will appear here...';
}

async function processImageFile(file) {
    // Show preview
    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64 = e.target.result; // data:image/...;base64,...
        const imgEl = document.getElementById('img-preview');
        const previewWrap = document.getElementById('img-preview-wrap');
        const dropZone = document.getElementById('img-drop-zone');

        imgEl.src = base64;
        previewWrap.style.display = 'block';
        dropZone.style.display = 'none';

        // Show loading
        const out = document.getElementById('trans-result');
        out.innerHTML = '<span class="spinner"></span> AI đang đọc và dịch ảnh...';

        // Call Groq Vision API (llama-4-scout supports vision)
        try {
            const base64Data = base64.split(',')[1];
            const mimeType = file.type || 'image/jpeg';

            const response = await fetch(getProxyBase() + '/api/vision', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
                    max_tokens: 1500,
                    messages: [{
                        role: 'user',
                        content: [
                            {
                                type: 'image_url',
                                image_url: { url: 'data:' + mimeType + ';base64,' + base64Data }
                            },
                            {
                                type: 'text',
                                text: 'Hay:\n1. Doc toan bo van ban trong anh (neu co)\n2. Dich sang tieng Viet (neu la tieng Anh) hoac tieng Anh (neu la tieng Viet)\n3. Giai thich ngan gon noi dung anh\n4. Neu khong co chu trong anh, mo ta anh va dich neu co text nao\n\nFormat tra ve:\nVAN BAN GOC:\n[text trong anh]\n\nBAN DICH:\n[ban dich]\n\nPHAN TICH:\n[giai thich ngan]'
                            }
                        ]
                    }]
                })
            });

            const data = await response.json();
            if (data.error) {
                // Fallback: dùng OCR đơn giản bằng canvas + text model
                out.textContent = 'Vision API chua ho tro. Hay copy text tu anh va paste vao tab Text de dich. Loi: ' + data.error.message;
                return;
            }
            out.textContent = data.choices[0].message.content;
            S.dailyCount++;
            sessionStorage.setItem('ass_daily', S.dailyCount);
            document.getElementById('daily-count').textContent = S.dailyCount;
        } catch(err) {
            out.textContent = '❌ Lỗi: ' + err.message;
        }
    };
    reader.readAsDataURL(file);
}
function speakResult() {
    const t = document.getElementById('trans-result').textContent;
    if (!t || t.includes('Kết quả')) return;
    const u = new SpeechSynthesisUtterance(t); u.lang = 'en-US'; speechSynthesis.speak(u);
}
function copyResult() { navigator.clipboard.writeText(document.getElementById('trans-result').textContent).then(() => alert('Copied!')); }
function saveToVocab() {
    const w = document.getElementById('trans-input').value.trim();
    const m = document.getElementById('trans-result').textContent.split('\n')[0].trim();
    if (!w || !m || m.includes('Kết quả')) return alert('No content to save yet!');
    S.words.unshift({ id: Date.now(), word: w, meaning: m, example: '' });
    save(); updateHomeStats(); alert('Saved to vocabulary!');
}

// ─── 2. VOCAB ───
function renderVocab() {
    const q = (document.getElementById('vocab-search')?.value || '').toLowerCase();
    const data = q ? S.words.filter(w => w.word.toLowerCase().includes(q) || w.meaning.toLowerCase().includes(q)) : S.words;
    const grid = document.getElementById('vocab-grid');
    grid.innerHTML = data.length ? data.map(w => `
        <div class="vocab-card">
            <div class="flex-between">
                <div class="vocab-word">${w.word}</div>
                <button class="btn icon danger sm" onclick="deleteVocab(${w.id})"><i class="fa-solid fa-trash"></i></button>
            </div>
            <div class="vocab-meaning">${w.meaning}</div>
            ${w.example ? '<div style="font-size:12px;color:var(--text3);margin-top:8px;font-style:italic">"' + w.example + '"</div>' : ''}
            <div class="vocab-actions">
                <button class="btn sm ghost" onclick="speakWord('${w.word}')"><i class="fa-solid fa-volume-high"></i></button>
                <button class="btn sm ghost" onclick="aiExplainWord('${w.word}',${w.id})"><i class="fa-solid fa-brain"></i> AI Giải thích</button>
            </div>
            <div id="explain-${w.id}" class="result-box hidden" style="margin-top:10px;font-size:13px;min-height:auto"></div>
        </div>
    `).join('') : `<div style="grid-column:1/-1;text-align:center;color:var(--text3);padding:40px">Library is empty.</div>`;
    updateHomeStats();
}
function addWord() {
    const w = document.getElementById('nw-word').value.trim();
    const m = document.getElementById('nw-meaning').value.trim();
    const e = document.getElementById('nw-example').value.trim();
    if (!w || !m) return alert('Please fill in both word and meaning!');
    S.words.unshift({ id: Date.now(), word: w, meaning: m, example: e });
    save(); renderVocab();
    ['nw-word','nw-meaning','nw-example'].forEach(id => document.getElementById(id).value = '');
}
function deleteVocab(id) { if(confirm('Delete this word?')) { S.words = S.words.filter(x => x.id !== id); save(); renderVocab(); } }
function speakWord(w) { const u = new SpeechSynthesisUtterance(w); u.lang = 'en-US'; speechSynthesis.speak(u); }
async function aiExplainWord(word, id) {
    const box = document.getElementById(`explain-${id}`);
    box.classList.remove('hidden');
    box.innerHTML = '<span class="spinner"></span> Đang phân tích...';
    box.textContent = await callAI(`Phân tích từ "${word}": phát âm IPA, loại từ, nghĩa đầy đủ, 2 ví dụ câu hay, từ đồng nghĩa/trái nghĩa. Ngắn gọn.`);
}
async function aiGenerateVocab() {
    const topic = prompt('Enter a topic to generate vocabulary:');
    if (!topic) return;
    const res = await callAI(`Generate 8 từ vựng tiếng Anh chủ đề "${topic}" trình độ B2-C1. Mỗi từ: từ vựng | nghĩa tiếng Việt | ví dụ câu. Dùng dấu | phân cách, mỗi từ một dòng.`, 'Chỉ trả về danh sách theo định dạng yêu cầu.');
    const lines = res.split('\n').filter(l => l.includes('|'));
    lines.forEach(line => {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length >= 2) S.words.unshift({ id: Date.now() + Math.random(), word: parts[0], meaning: parts[1], example: parts[2] || '' });
    });
    save(); renderVocab(); alert(`Added ${lines.length} new words!`);
}

// ─── 3. FILES ───
async function handleFileUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    const out = document.getElementById('solver-view');
    out.classList.remove('hidden'); out.innerHTML = '<span class="spinner"></span> Reading file...';
    let text = '';
    try {
        if (file.name.endsWith('.docx')) { const res = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() }); text = res.value; }
        else if (file.name.endsWith('.pdf')) {
            const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise;
            for (let i = 1; i <= Math.min(pdf.numPages, 8); i++) { const pg = await pdf.getPage(i); const tc = await pg.getTextContent(); text += tc.items.map(t => t.str).join(' ') + '\n'; }
        } else { text = await file.text(); }
    } catch (err) { out.textContent = 'Cannot read file: ' + err.message; return; }
    S.docText = text;
    if (!S.files.find(f => f.name === file.name)) { S.files.push({ id: Date.now(), name: file.name, content: text, date: new Date().toLocaleDateString('vi-VN') }); save(); }
    renderFiles();
    out.innerHTML = '<span class="spinner"></span> AI đang phân tích...';
    out.textContent = await callAI(`Analyze the following document:\n1. Summarize the main content\n2. Solve each exercise/question in detail\n3. Explain difficult vocabulary\n4. Note important grammar points\n\nDocument:\n${text.slice(0, 3500)}`, 'You are a professional English tutor.');
}
function renderFiles() {
    const box = document.getElementById('file-list');
    const badge = document.getElementById('file-count-badge');
    if (badge) badge.textContent = `${S.files.length} file`;
    S.files.sort((a,b) => a.name.localeCompare(b.name));
    box.innerHTML = S.files.length ? S.files.map(f => `
        <div class="file-item" onclick="loadDocFile(${f.id})">
            <div><div class="file-name"><i class="fa-solid fa-file-lines" style="color:var(--accent2);margin-right:6px"></i>${f.name}</div>
            <div class="file-meta">${f.date||''} · ${(f.content.length/1000).toFixed(1)}K ký tự</div></div>
            <button class="btn icon danger sm" onclick="event.stopPropagation();deleteFile(${f.id})"><i class="fa-solid fa-trash"></i></button>
        </div>`).join('') : '<p style="text-align:center;color:var(--text3);padding:30px">Chưa có file nào.</p>';
    updateHomeStats();
}
function loadDocFile(id) { const f = S.files.find(x => x.id === id); if (f) { S.docText = f.content; alert(`✓ "${f.name}" loaded!`); } }
function deleteFile(id) { if(confirm('Delete this file?')) { S.files = S.files.filter(x => x.id !== id); save(); renderFiles(); } }
function addWordManual() {
    const w = document.getElementById('m-word').value.trim();
    const m = document.getElementById('m-meaning').value.trim();
    if (!w || !m) return alert('Please fill in all fields!');
    S.words.unshift({ id: Date.now(), word: w, meaning: m, example: '' });
    save(); updateHomeStats();
    document.getElementById('m-word').value = ''; document.getElementById('m-meaning').value = '';
    alert('Saved!');
}

let currentSkill = null;
let _currentExamContext = 'IELTS'; // track which section called runSkill

function selectSkill(s, examCtx) {
    currentSkill = s;
    _currentExamContext = examCtx || 'IELTS';
    document.querySelectorAll('.skill-hero').forEach(c => c.style.outline = '');
    event.currentTarget.style.outline = '2px solid var(--accent)';
    const btn = document.getElementById('run-skill-btn');
    if (btn) btn.innerHTML = `<i class="fa-solid fa-play"></i> Practice ${s}`;
}

function switchIeltsMode(mode, btn) {
    const skillsPanel = document.getElementById('ielts-skills-panel');
    const quizPanel = document.getElementById('ielts-quiz-panel');
    if (skillsPanel) skillsPanel.style.display = mode === 'skills' ? 'block' : 'none';
    if (quizPanel) quizPanel.style.display = mode === 'quiz' ? 'block' : 'none';
    document.querySelectorAll('[id^="ielts-mode-"]').forEach(b => {
        b.style.background = 'transparent'; b.style.borderColor = 'var(--border2)'; b.style.color = 'var(--text2)';
    });
    if (btn) { btn.style.background = 'rgba(59,130,246,0.12)'; btn.style.borderColor = 'var(--accent)'; btn.style.color = 'var(--accent)'; }
}

function switchToeicMode(mode, btn) {
    const skillsPanel = document.getElementById('toeic-skills-panel');
    const quizPanel = document.getElementById('toeic-quiz-panel');
    if (skillsPanel) skillsPanel.style.display = mode === 'skills' ? 'block' : 'none';
    if (quizPanel) quizPanel.style.display = mode === 'quiz' ? 'block' : 'none';
    document.querySelectorAll('[id^="toeic-mode-"]').forEach(b => {
        b.style.background = 'transparent'; b.style.borderColor = 'var(--border2)'; b.style.color = 'var(--text2)';
    });
    if (btn) { btn.style.background = 'rgba(245,158,11,0.12)'; btn.style.borderColor = 'var(--gold)'; btn.style.color = 'var(--gold)'; }
}

let _currentToeicSkill = 'Part5-Grammar';
function selectSkillToeic(s) {
    _currentToeicSkill = s;
    document.querySelectorAll('.skill-hero').forEach(c => c.style.outline = '');
    event.currentTarget.style.outline = '2px solid var(--gold)';
    const btn = document.getElementById('run-toeic-btn');
    if (btn) btn.innerHTML = `<i class="fa-solid fa-play"></i> Practice ${s}`;
}
function adjustToeicSkillQ(delta) {
    const inp = document.getElementById('toeic-skill-q-count');
    if (!inp) return;
    let val = parseInt(inp.value || 4) + delta;
    val = Math.max(2, Math.min(20, val));
    inp.value = val;
}
async function runToeicSkill() {
    const res = document.getElementById('toeic-skill-result');
    res.style.display = 'block';
    res.className = 'skill-result loading';
    res.innerHTML = '<span class="spinner"></span> AI Coach đang tạo bài TOEIC...';
    const qCount = parseInt(document.getElementById('toeic-skill-q-count')?.value || '4');
    const lvl = S.skillLevel;
    const prompt = `Create a TOEIC ${_currentToeicSkill} exercise at ${lvl} level.
Return ONLY valid JSON:
{"passage":"context/passage (100-200 words)","questions":[{"q":"question","opts":["A. opt","B. opt","C. opt","D. opt"],"ans":0,"explain":"why"}]}
Generate exactly ${qCount} questions.`;
    try {
        const raw = await callAI(prompt, 'You are a professional TOEIC Coach. Return only valid JSON.');
        const data = JSON.parse(raw.replace(/```json|```/g,'').trim());
        skillQuizState = { questions: data.questions, current: 0, score: 0, passage: data.passage, skill: _currentToeicSkill };
        res.className = 'skill-result';
        renderSkillQuizIn('toeic-skill-result');
    } catch(e) {
        res.className = 'skill-result';
        res.textContent = 'Lỗi parse. Thử lại nhé!\n' + e.message;
    }
}
function renderSkillQuizIn(containerId) {
    // Reuse renderSkillQuiz but output to a given container
    const savedId = 'skill-result';
    // Swap render target temporarily
    const orig = document.getElementById(savedId);
    const target = document.getElementById(containerId);
    if (target && orig && containerId !== savedId) {
        const origDisplay = orig.style.display;
        // Store ref, render to target
        skillQuizState._container = containerId;
    }
    renderSkillQuiz();
}
function adjustSkillQ(delta) {
    const inp = document.getElementById('skill-q-count');
    if (!inp) return;
    let val = parseInt(inp.value || 4) + delta;
    val = Math.max(2, Math.min(20, val));
    inp.value = val;
}
function setLevel(l, btn) { S.skillLevel = l; document.querySelectorAll('.lvl-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
function setSkillSrc(s, btn) { S.skillSrc = s; document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }

// ─── 4 SKILLS — STATE ───
let skillQuizState = { questions: [], current: 0, score: 0, passage: '', skill: '' };

async function runSkill() {
    if (!currentSkill) return alert('Please select a skill first!');

    const res = document.getElementById('skill-result');
    const writingArea = document.getElementById('writing-area');
    writingArea.classList.add('hidden');
    res.style.display = 'block';
    res.className = 'skill-result loading';
    res.innerHTML = '<span class="spinner"></span> AI Coach is creating your exercise...';

    const qCount = parseInt(document.getElementById('skill-q-count')?.value || '4');
    let context = S.skillSrc === 'doc' && S.docText ? `Based on this document: ${S.docText.slice(0,1200)}` :
                  S.skillSrc === 'vocab' && S.words.length ? `Using these words: ${S.words.slice(0,15).map(w=>w.word).join(', ')}` :
                  'Random interesting IELTS/TOEIC academic topic';

    // Writing & Speaking → không có trắc nghiệm
    if (currentSkill === 'Writing') {
        const prompt = `Create a ${S.skillLevel} Writing prompt. ${context}. Include: a clear task, a 4-paragraph outline guide, 8-10 useful linking words, sample opening sentences. All in English.`;
        res.className = 'skill-result';
        res.textContent = await callAI(prompt, 'You are a professional IELTS/TOEIC Coach.');
        writingArea.classList.remove('hidden');
        return;
    }

    if (currentSkill === 'Speaking') {
        const prompt = `Create a ${S.skillLevel} Speaking exercise. ${context}. Include: 1 interesting topic, 5-6 key talking points, 8-10 useful vocabulary with IPA pronunciation, 2-3 useful sentence structures, pronunciation tips. All in English.`;
        res.className = 'skill-result';
        res.textContent = await callAI(prompt, 'You are a professional IELTS/TOEIC Coach.');
        return;
    }

    // Listening & Reading → trắc nghiệm A-B-C-D
    const prompts = {
        Listening: `Create a ${S.skillLevel} Listening exercise for IELTS/TOEIC. ${context}.
Return ONLY valid JSON (no markdown, no extra text) in this exact format:
{
  "passage": "A short audio script (150-200 words) as if heard by the student",
  "questions": [
    {"q": "Question text", "opts": ["A. option", "B. option", "C. option", "D. option"], "ans": 0, "explain": "Why this answer is correct"}
  ]
}
Generate exactly ${qCount} questions. ans is index 0-3.`,

        Reading: `Create a ${S.skillLevel} Reading exercise for IELTS/TOEIC. ${context}.
Return ONLY valid JSON (no markdown, no extra text) in this exact format:
{
  "passage": "A reading passage of 200-250 words",
  "questions": [
    {"q": "Question text", "opts": ["A. option", "B. option", "C. option", "D. option"], "ans": 0, "explain": "Why this answer is correct"}
  ]
}
Generate exactly ${qCount} questions. ans is index 0-3.`
    };

    try {
        const raw = await callAI(prompts[currentSkill], 'You are a professional IELTS/TOEIC Coach. Return only valid JSON exactly as specified.');
        const clean = raw.replace(/```json|```/g, '').trim();
        const data = JSON.parse(clean);

        skillQuizState = { questions: data.questions, current: 0, score: 0, passage: data.passage, skill: currentSkill };
        res.className = 'skill-result';
        renderSkillQuiz();
    } catch(e) {
        res.className = 'skill-result';
        res.textContent = 'Lỗi parse JSON. Thử lại nhé!\n\n' + e.message;
    }
}

// ═══════════════════════════════════════════
//  TTS ENGINE — IMPROVED BROWSER SPEECH
// ═══════════════════════════════════════════
let _tts = {
    playing: false, paused: false, rate: 1.0,
    listenCount: 0, words: [], wordIndex: 0,
    utterance: null, chunkTimer: null, keepAlive: null
};

// Chrome bug fix: speechSynthesis stops after ~15s — keepalive ping
function _ttsKeepAlive() {
    clearInterval(_tts.keepAlive);
    _tts.keepAlive = setInterval(() => {
        if (_tts.playing && !speechSynthesis.speaking) {
            // Bị dừng đột ngột — resume
            speechSynthesis.resume();
        }
    }, 5000);
}

function _getBestVoice() {
    const voices = speechSynthesis.getVoices();
    // Ưu tiên giọng đọc rõ nhất theo thứ tự
    const priority = [
        'Google US English', 'Google UK English Female', 'Google UK English Male',
        'Samantha', 'Daniel', 'Karen', 'Moira', 'Alex', 'Victoria',
        'Microsoft Zira', 'Microsoft David', 'Microsoft Mark'
    ];
    for (const name of priority) {
        const v = voices.find(v => v.name === name);
        if (v) return v;
    }
    // Fallback: bất kỳ giọng en-US nào
    return voices.find(v => v.lang === 'en-US')
        || voices.find(v => v.lang.startsWith('en'))
        || null;
}

function _ttsUpdateUI() {
    const btn = document.getElementById('tts-playpause');
    const status = document.getElementById('tts-status');
    if (btn) {
        if (_tts.playing) {
            btn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
            btn.style.background = 'linear-gradient(135deg,var(--gold),#d97706)';
        } else if (_tts.paused) {
            btn.innerHTML = '<i class="fa-solid fa-play"></i> Resume';
            btn.style.background = 'linear-gradient(135deg,var(--accent),#2563eb)';
        } else {
            btn.innerHTML = '<i class="fa-solid fa-play"></i> Play';
            btn.style.background = 'linear-gradient(135deg,var(--green),#059669)';
        }
    }
    if (status) {
        if (_tts.playing) status.textContent = '🔊 Đang phát...';
        else if (_tts.paused) status.textContent = '⏸ Đã tạm dừng';
        else if (_tts.listenCount > 0) status.textContent = '✓ Đã nghe ' + _tts.listenCount + ' lần';
        else status.textContent = 'Nhấn Play để nghe bài';
    }
    // Wave animation
    document.querySelectorAll('.wave-bar').forEach(b => {
        b.style.animationPlayState = _tts.playing ? 'running' : 'paused';
    });
}

function _ttsHighlightWord(index) {
    const el = document.getElementById('tts-script-text');
    if (!el || !_tts.words.length) return;
    const highlighted = _tts.words.map((w, i) =>
        i === index
            ? '<mark style="background:rgba(16,185,129,0.4);color:#fff;border-radius:3px;padding:1px 3px;transition:background 0.1s">' + w + '</mark>'
            : w
    ).join(' ');
    el.innerHTML = highlighted;
}

function _ttsResetHighlight() {
    const el = document.getElementById('tts-script-text');
    if (el) el.innerHTML = _tts.words.join(' ');
}

// Tách văn bản thành chunks ngắn để tránh Chrome cắt giữa chừng
function _ttsSpeak(text, rate) {
    speechSynthesis.cancel();
    _tts.playing = false;
    _tts.paused = false;

    // Tách thành câu (chunk) để Chrome không bị timeout
    const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    let chunkIdx = 0;

    _tts.words = text.split(/\s+/);
    _tts.wordIndex = 0;

    function speakChunk() {
        if (chunkIdx >= sentences.length) {
            _tts.playing = false; _tts.paused = false;
            clearInterval(_tts.keepAlive);
            _ttsResetHighlight();
            _ttsUpdateUI();
            // Cập nhật count
            const countEl = document.getElementById('tts-count');
            if (countEl) countEl.textContent = 'Lần nghe: ' + _tts.listenCount;
            return;
        }
        const chunk = sentences[chunkIdx].trim();
        if (!chunk) { chunkIdx++; speakChunk(); return; }

        const utter = new SpeechSynthesisUtterance(chunk);
        utter.lang = 'en-US';
        utter.rate = rate;
        utter.pitch = 1.0;
        utter.volume = 1.0;
        const voice = _getBestVoice();
        if (voice) utter.voice = voice;

        // Highlight từng từ bằng word boundary
        utter.onboundary = (e) => {
            if (e.name === 'word') {
                // Tìm vị trí từ trong toàn bộ text
                const chunksBefore = sentences.slice(0, chunkIdx).join(' ');
                const offset = chunksBefore.length + (chunksBefore ? 1 : 0) + e.charIndex;
                const textBefore = text.substring(0, offset);
                const wordIdx = textBefore.split(/\s+/).length - 1;
                _ttsHighlightWord(Math.max(0, wordIdx));
            }
        };

        utter.onstart = () => {
            _tts.playing = true; _tts.paused = false;
            _ttsUpdateUI();
        };
        utter.onend = () => {
            chunkIdx++;
            speakChunk();
        };
        utter.onerror = (e) => {
            if (e.error === 'interrupted' || e.error === 'canceled') return;
            chunkIdx++;
            speakChunk();
        };

        speechSynthesis.speak(utter);
        _tts.utterance = utter;
    }

    _tts.listenCount++;
    _tts.playing = true; _tts.paused = false;
    _ttsUpdateUI();
    _ttsKeepAlive();
    speakChunk();
}

function ttsPlayPause() {
    const text = skillQuizState.passage;
    if (!text) return;

    if (_tts.playing) {
        speechSynthesis.pause();
        _tts.playing = false; _tts.paused = true;
        _ttsUpdateUI(); return;
    }
    if (_tts.paused) {
        speechSynthesis.resume();
        _tts.playing = true; _tts.paused = false;
        _ttsUpdateUI(); return;
    }
    // Voices có thể chưa load xong — đợi nếu cần
    if (!speechSynthesis.getVoices().length) {
        speechSynthesis.onvoiceschanged = () => { _ttsSpeak(text, _tts.rate); };
    } else {
        _ttsSpeak(text, _tts.rate);
    }
}

function ttsSetRate(r) {
    _tts.rate = parseFloat(r);
    const lbl = document.getElementById('tts-rate-lbl');
    if (lbl) lbl.textContent = parseFloat(r).toFixed(2).replace('.00','').replace(/\.?0+$/,'') + 'x';
    // Nếu đang play thì restart với tốc độ mới
    if (_tts.playing || _tts.paused) {
        _ttsSpeak(skillQuizState.passage, _tts.rate);
    }
}

function ttsReplay() {
    _tts.paused = false;
    _ttsSpeak(skillQuizState.passage, _tts.rate);
}

function ttsStop() {
    speechSynthesis.cancel();
    _tts.playing = false; _tts.paused = false;
    clearInterval(_tts.keepAlive);
    _ttsResetHighlight();
    _ttsUpdateUI();
}

function _ttsStop() { ttsStop(); }

// Chọn giọng: render dropdown giọng đọc
function ttsRenderVoiceSelect() {
    const sel = document.getElementById('tts-voice-sel');
    if (!sel) return;
    const voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
    const best = _getBestVoice();
    sel.innerHTML = voices.map(v =>
        '<option value="' + v.name + '"' + (v === best ? ' selected' : '') + '>' + v.name + ' (' + v.lang + ')</option>'
    ).join('');
}
function ttsSetVoice(name) {
    // Lưu tên giọng được chọn
    _tts.selectedVoiceName = name;
}
function _getBestVoice() {
    const voices = speechSynthesis.getVoices();
    if (_tts.selectedVoiceName) {
        const chosen = voices.find(v => v.name === _tts.selectedVoiceName);
        if (chosen) return chosen;
    }
    const priority = [
        'Google US English','Google UK English Female','Google UK English Male',
        'Samantha','Daniel','Karen','Moira','Alex','Victoria',
        'Microsoft Zira Desktop','Microsoft David Desktop','Microsoft Mark Desktop'
    ];
    for (const name of priority) {
        const v = voices.find(v => v.name === name);
        if (v) return v;
    }
    return voices.find(v => v.lang === 'en-US') || voices.find(v => v.lang.startsWith('en')) || null;
}

// Tự động load voices khi sẵn sàng
speechSynthesis.onvoiceschanged = () => { ttsRenderVoiceSelect(); };

let _waveTimer = null;
function _ttsWatchPlay() {
    clearInterval(_waveTimer);
    _waveTimer = setInterval(_ttsUpdateUI, 400);
}

function renderSkillQuiz() {
    ttsStop();
    clearInterval(_waveTimer);
    const res = document.getElementById('skill-result');
    const { questions, current, score, passage, skill } = skillQuizState;

    if (current >= questions.length) {
        const pct = Math.round((score / questions.length) * 100);
        const trophy = pct >= 80 ? '🏆' : pct >= 60 ? '🎯' : '📚';
        const msg = pct >= 80 ? 'Excellent! Well done!' : pct >= 60 ? 'Good job! Keep practicing!' : 'Keep going! You can do it!';
        res.innerHTML = '<div style="text-align:center;padding:20px">'
            + '<div style="font-size:52px;margin-bottom:12px">' + trophy + '</div>'
            + '<div style="font-family:\'Syne\',sans-serif;font-size:42px;font-weight:900;color:var(--accent)">' + pct + '%</div>'
            + '<div style="color:var(--text2);margin:8px 0;font-size:15px">' + score + '/' + questions.length + ' correct</div>'
            + '<div style="color:var(--text3);font-size:13px;margin-bottom:20px">' + msg + '</div>'
            + '<button class="btn" onclick="runSkill()"><i class="fa-solid fa-rotate"></i> Try Again</button>'
            + '</div>';
        return;
    }

    const q = questions[current];
    const total = questions.length;
    const labels = ['A','B','C','D'];
    const color = skill === 'Listening' ? 'var(--green)' : 'var(--accent)';

    // Wave bars
    var waveBars = '';
    for (var wi = 0; wi < 32; wi++) {
        var h = Math.round(6 + Math.sin(wi * 0.7) * 13 + Math.random() * 7);
        waveBars += '<div class="wave-bar" style="width:3px;border-radius:3px;background:linear-gradient(to top,var(--green),#06b6d4);height:' + h + 'px;'
            + 'animation:wavePulse ' + (0.5 + Math.random() * 0.9).toFixed(2) + 's ease-in-out infinite alternate;'
            + 'animation-play-state:paused;animation-delay:' + (wi * 0.04).toFixed(2) + 's"></div>';
    }

    var passageBlock;
    if (skill === 'Listening') {
        passageBlock =
            '<div style="background:linear-gradient(135deg,rgba(16,185,129,0.07),rgba(6,182,212,0.05));'
            + 'border:1px solid rgba(16,185,129,0.25);border-radius:18px;padding:22px;margin-bottom:22px">'

            // ── Header ──
            + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">'
            + '<div style="width:46px;height:46px;border-radius:14px;background:linear-gradient(135deg,var(--green),#0891b2);'
            + 'display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 4px 16px rgba(16,185,129,0.3)">🎧</div>'
            + '<div style="flex:1">'
            + '<div style="font-weight:800;font-size:15px;color:var(--text)">Listening Audio</div>'
            + '<div style="font-size:12px;color:var(--text3);margin-top:2px" id="tts-status">Nhấn Play để nghe bài</div>'
            + '</div>'
            + '<div style="text-align:right">'
            + '<div style="font-size:10px;color:var(--green);background:rgba(16,185,129,0.1);padding:4px 10px;'
            + 'border-radius:20px;border:1px solid rgba(16,185,129,0.2);font-weight:700">🔊 Browser TTS</div>'
            + '<div style="font-size:10px;color:var(--text3);margin-top:4px" id="tts-count"></div>'
            + '</div></div>'

            // ── Waveform ──
            + '<div style="display:flex;align-items:center;justify-content:center;gap:2px;height:48px;'
            + 'margin-bottom:18px;padding:4px 8px;background:rgba(0,0,0,0.15);border-radius:10px">'
            + waveBars + '</div>'

            // ── Main controls ──
            + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap">'
            + '<button id="tts-playpause" onclick="ttsPlayPause()" style="background:linear-gradient(135deg,var(--green),#059669);color:white;border:none;'
            + 'padding:12px 24px;border-radius:12px;font-weight:700;font-size:14px;cursor:pointer;'
            + 'display:flex;align-items:center;gap:8px;font-family:\'DM Sans\',sans-serif;min-width:120px;'
            + 'justify-content:center;transition:all 0.2s"><i class="fa-solid fa-play"></i> Play</button>'

            + '<button onclick="ttsReplay()" title="Nghe lại từ đầu" style="background:rgba(255,255,255,0.06);color:var(--text2);border:1px solid var(--border2);'
            + 'padding:12px 16px;border-radius:12px;font-weight:600;font-size:13px;cursor:pointer;'
            + 'display:flex;align-items:center;gap:6px;font-family:\'DM Sans\',sans-serif;transition:0.2s">'
            + '<i class="fa-solid fa-rotate-left"></i> Replay</button>'

            + '<button onclick="ttsStop()" title="Dừng hoàn toàn" style="background:rgba(255,255,255,0.06);color:var(--text2);border:1px solid var(--border2);'
            + 'padding:12px 16px;border-radius:12px;font-weight:600;font-size:13px;cursor:pointer;'
            + 'display:flex;align-items:center;gap:6px;font-family:\'DM Sans\',sans-serif;transition:0.2s">'
            + '<i class="fa-solid fa-stop"></i> Stop</button>'

            // Speed control
            + '<div style="display:flex;align-items:center;gap:8px;margin-left:auto;background:rgba(0,0,0,0.15);'
            + 'padding:8px 14px;border-radius:10px;border:1px solid var(--border2)">'
            + '<span style="font-size:11px;color:var(--text3);font-weight:700">SPEED</span>'
            + '<input type="range" min="0.5" max="1.5" step="0.25" value="1" oninput="ttsSetRate(this.value)" '
            + 'style="width:80px;accent-color:var(--green);cursor:pointer">'
            + '<span id="tts-rate-lbl" style="font-size:13px;font-weight:800;color:var(--green);min-width:30px;font-family:\'Syne\',sans-serif">1x</span>'
            + '</div></div>'

            // Voice selector
            + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">'
            + '<span style="font-size:11px;color:var(--text3);font-weight:700;white-space:nowrap">🗣 VOICE</span>'
            + '<select id="tts-voice-sel" onchange="ttsSetVoice(this.value)" '
            + 'style="flex:1;background:rgba(255,255,255,0.04);border:1px solid var(--border2);border-radius:8px;'
            + 'padding:7px 10px;color:var(--text);font-size:12px;font-family:\'DM Sans\',sans-serif;cursor:pointer">'
            + '<option>Loading voices...</option></select>'
            + '</div>'

            // Script spoiler
            + '<details>'
            + '<summary style="font-size:12px;color:var(--text3);cursor:pointer;list-style:none;'
            + 'display:flex;align-items:center;gap:6px;padding:6px 0;user-select:none">'
            + '<i class="fa-solid fa-scroll" style="font-size:10px;color:var(--accent)"></i>'
            + '<span>Xem script (nên nghe trước khi đọc)</span>'
            + '</summary>'
            + '<div style="margin-top:12px;padding:16px;background:rgba(0,0,0,0.25);border-radius:12px;'
            + 'font-size:13px;line-height:2;color:var(--text2);letter-spacing:0.2px" id="tts-script-text">'
            + passage + '</div>'
            + '</details>'
            + '</div>';
    } else {
        passageBlock = '<div style="background:rgba(0,0,0,0.2);border-left:3px solid ' + color + ';'
            + 'border-radius:12px;padding:18px;margin-bottom:20px;font-size:13px;line-height:1.9;'
            + 'color:var(--text2);max-height:220px;overflow-y:auto">'
            + '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;'
            + 'color:' + color + ';margin-bottom:10px"><i class="fa-solid fa-book-open"></i> Reading Passage</div>'
            + passage + '</div>';
    }

    var optsHtml = q.opts.map(function(opt, i) {
        return '<button onclick="answerSkillQuiz(' + i + ')" '
            + 'style="display:flex;align-items:center;gap:14px;padding:14px 18px;border-radius:12px;'
            + 'border:1px solid var(--border2);background:rgba(255,255,255,0.02);cursor:pointer;'
            + 'transition:all 0.2s;font-size:14px;text-align:left;color:var(--text);width:100%;'
            + 'font-family:\'DM Sans\',sans-serif">'
            + '<span style="width:30px;height:30px;border-radius:8px;background:rgba(255,255,255,0.06);'
            + 'border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;'
            + 'font-weight:800;font-size:13px;flex-shrink:0;color:var(--text2)">' + labels[i] + '</span>'
            + '<span>' + opt.replace(/^[A-D]\.\s*/,'') + '</span></button>';
    }).join('');

    res.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
        + '<span style="font-size:12px;color:var(--text3);font-family:\'JetBrains Mono\',monospace">'
        + skill + ' · ' + S.skillLevel + ' · Câu ' + (current+1) + '/' + total + '</span>'
        + '<span style="font-size:12px;font-weight:700;color:' + color + '">✓ ' + score + ' đúng</span></div>'
        + '<div style="height:5px;background:var(--bg3);border-radius:10px;margin-bottom:20px;overflow:hidden">'
        + '<div style="height:100%;width:' + Math.round((current/total)*100) + '%;'
        + 'background:linear-gradient(90deg,' + color + ',var(--accent2));border-radius:10px;transition:width 0.4s"></div></div>'
        + passageBlock
        + '<div style="font-size:15px;font-weight:600;line-height:1.6;margin-bottom:16px;color:var(--text)">'
        + (current+1) + '. ' + q.q + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:10px" id="skill-opts">' + optsHtml + '</div>'
        + '<div id="skill-reveal" style="display:none;margin-top:16px;padding:14px 18px;border-radius:12px;'
        + 'font-size:13px;line-height:1.7;color:var(--text2)"></div>';

    if (skill === 'Listening') {
        // Load voice list sau khi DOM render xong
        setTimeout(() => {
            ttsRenderVoiceSelect();
            _ttsWatchPlay();
        }, 100);
    }
}


function answerSkillQuiz(idx) {
    const { questions, current } = skillQuizState;
    const q = questions[current];
    const labels = ['A', 'B', 'C', 'D'];
    const btns = document.querySelectorAll('#skill-opts button');

    btns.forEach((btn, i) => {
        btn.disabled = true;
        btn.style.cursor = 'default';
        const label = btn.querySelector('span:first-child');
        if (i === q.ans) {
            btn.style.borderColor = 'var(--green)';
            btn.style.background = 'rgba(16,185,129,0.12)';
            btn.style.color = 'var(--green)';
            label.style.background = 'var(--green)';
            label.style.color = 'white';
            label.style.borderColor = 'var(--green)';
        } else if (i === idx && i !== q.ans) {
            btn.style.borderColor = 'var(--red)';
            btn.style.background = 'rgba(239,68,68,0.1)';
            btn.style.color = 'var(--red)';
            label.style.background = 'var(--red)';
            label.style.color = 'white';
            label.style.borderColor = 'var(--red)';
        }
    });

    if (idx === q.ans) skillQuizState.score++;

    const reveal = document.getElementById('skill-reveal');
    reveal.style.display = 'block';
    const isCorrect = idx === q.ans;
    reveal.style.background = isCorrect ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.07)';
    reveal.style.borderColor = isCorrect ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.2)';
    reveal.innerHTML = `
        <strong style="color:${isCorrect ? 'var(--green)' : 'var(--red)'}">
            ${isCorrect ? '✓ Correct!' : `✗ Wrong — Correct answer: ${labels[q.ans]}. ${q.opts[q.ans]}`}
        </strong><br><br>
        <span style="color:var(--text2)">💡 ${q.explain}</span>
        <div style="margin-top:14px;text-align:right">
            <button class="btn sm" onclick="nextSkillQuestion()" style="min-width:120px">
                ${skillQuizState.current + 1 >= skillQuizState.questions.length ? '🏆 View Results' : 'Next →'}
            </button>
        </div>`;
}

function nextSkillQuestion() {
    skillQuizState.current++;
    renderSkillQuiz();
}

async function submitWriting() {
    const text = document.getElementById('writing-submission').value.trim();
    if (!text) return alert('Hãy viết bài trước!');
    const fb = document.getElementById('writing-feedback');
    fb.classList.remove('hidden'); fb.innerHTML = '<span class="spinner"></span> AI đang chấm bài...';
    fb.textContent = await callAI(`Grade this English writing based on IELTS criteria:\n1. Task Achievement\n2. Coherence & Cohesion\n3. Lexical Resource\n4. Grammatical Range\n\nGive a Band score 1-9.\n\nWriting:\n${text}`, 'You are a professional IELTS examiner.');
}

// ─── 5. QUIZ ───
// ═══════════════════════════════════════════
//  QUIZ LAB — 4 SKILLS NÂNG CAO
// ═══════════════════════════════════════════
let _ieltsSelectedSkills = ['Vocabulary','Grammar','Reading','Listening'];
let _toeicSelectedSkills = ['Vocabulary','Grammar','Reading','Listening'];

function quizSkillToggle(cb, exam) {
    const skill = cb.value;
    const label = cb.closest('label');
    const arr = exam === 'toeic' ? _toeicSelectedSkills : _ieltsSelectedSkills;
    if (cb.checked) {
        if (!arr.includes(skill)) arr.push(skill);
        label.style.borderColor = exam === 'toeic' ? 'var(--gold)' : 'var(--accent)';
        label.style.background = exam === 'toeic' ? 'rgba(245,158,11,0.08)' : 'rgba(59,130,246,0.08)';
    } else {
        const idx = arr.indexOf(skill); if (idx >= 0) arr.splice(idx, 1);
        label.style.borderColor = 'var(--border2)';
        label.style.background = 'transparent';
    }
}

async function generateQuiz(examType) {
    // examType = 'IELTS' or 'TOEIC'
    const isIelts = examType === 'IELTS';
    const selectedSkills = isIelts ? _ieltsSelectedSkills : _toeicSelectedSkills;
    const src = document.getElementById(isIelts ? 'ielts-q-src' : 'toeic-q-src')?.value || 'ai';
    const lvl = document.getElementById(isIelts ? 'ielts-q-lvl' : 'toeic-q-lvl')?.value || 'Medium';
    const cnt = Math.min(40, Math.max(5, parseInt(document.getElementById(isIelts ? 'ielts-q-count' : 'toeic-q-count')?.value || '10')));
    const customQ = (document.getElementById(isIelts ? 'ielts-custom-q' : 'toeic-custom-q')?.value || '').trim();
    const container = document.getElementById(isIelts ? 'ielts-quiz-container' : 'toeic-quiz-container');
    const scoreEl = document.getElementById(isIelts ? 'ielts-score-display' : 'toeic-score-display');
    const scoreDetail = document.getElementById(isIelts ? 'ielts-score-detail' : 'toeic-score-detail');
    const progressEl = document.getElementById(isIelts ? 'ielts-quiz-progress' : 'toeic-quiz-progress');
    const progTxt = document.getElementById(isIelts ? 'ielts-prog-txt' : 'toeic-prog-txt');
    const progBar = document.getElementById(isIelts ? 'ielts-prog-bar' : 'toeic-prog-bar');

    if (selectedSkills.length === 0) { alert('Vui lòng chọn ít nhất 1 kỹ năng!'); return; }

    container.innerHTML = '<div class="card" style="text-align:center;padding:40px"><span class="spinner"></span>'
        + '<div style="margin-top:16px;color:var(--text2);font-size:14px">AI đang tạo ' + cnt + ' câu hỏi ' + examType + '...</div>'
        + '<div style="margin-top:8px;color:var(--text3);font-size:12px">Có thể mất 10-20 giây</div></div>';
    if (scoreEl) scoreEl.textContent = '—';
    if (progressEl) progressEl.style.display = 'none';

    let context = src === 'vocab' ? 'Based on vocabulary: ' + S.words.slice(0,15).map(w=>w.word).join(', ')
                : src === 'doc' && S.docText ? 'Based on this document: ' + S.docText.slice(0,1000)
                : `Random ${examType} topics`;
    if (customQ) context = 'Focus on these topics/questions: ' + customQ;

    const perSkill = Math.max(1, Math.floor(cnt / selectedSkills.length));
    const remainder = cnt - perSkill * selectedSkills.length;
    const skillInstructions = selectedSkills.map((s,i) => (perSkill + (i===0?remainder:0)) + ' câu về ' + s).join(', ');

    const prompt = 'Create exactly ' + cnt + ' English multiple-choice questions at ' + lvl + ' level.\n'
        + 'Distribution: ' + skillInstructions + '.\n'
        + context + '\n\n'
        + 'Return ONLY a valid JSON array, each item:\n'
        + '{"skill":"Vocabulary","q":"question text","opts":["A. opt","B. opt","C. opt","D. opt"],"ans":0,"explain":"why correct"}\n'
        + 'Exam type: ' + examType + '\n'
        + 'skill must be one of: ' + selectedSkills.join(', ') + '\n'
        + 'ans is index 0-3. No markdown, no extra text.';

    try {
        const raw = await callAI(prompt, `You are a ${examType} expert. Return only valid JSON array exactly as specified.`);
        const questions = JSON.parse(raw.replace(/```json|```/g,'').trim());

        quizState.questions = questions;
        quizState.current = 0;
        quizState.score = 0;
        quizState.skillScores = {};
        quizState._examType = examType;
        quizState._container = isIelts ? 'ielts-quiz-container' : 'toeic-quiz-container';
        quizState._progBar = isIelts ? 'ielts-prog-bar' : 'toeic-prog-bar';
        quizState._progTxt = isIelts ? 'ielts-prog-txt' : 'toeic-prog-txt';
        quizState._scoreDisplay = isIelts ? 'ielts-score-display' : 'toeic-score-display';
        quizState._scoreDetail = isIelts ? 'ielts-score-detail' : 'toeic-score-detail';
        selectedSkills.forEach(s => { quizState.skillScores[s] = { correct: 0, total: 0 }; });

        if (scoreEl) scoreEl.textContent = '0%';
        if (progressEl) progressEl.style.display = 'block';
        renderQuestion();
    } catch(e) {
        container.innerHTML = '<div class="card"><div style="color:var(--red);padding:20px;font-size:13px">❌ Lỗi tạo quiz. Thử lại nhé!<br><br>' + e.message + '</div></div>';
    }
}

let quizState = { questions: [], current: 0, score: 0, skillScores: {}, _container: 'ielts-quiz-container', _progBar: 'ielts-prog-bar', _progTxt: 'ielts-prog-txt', _scoreDisplay: 'ielts-score-display', _scoreDetail: 'ielts-score-detail', _examType: 'IELTS' };

const SKILL_COLORS = {
    Vocabulary: 'var(--accent2)',
    Grammar:    'var(--accent)',
    Reading:    'var(--accent3)',
    Listening:  'var(--green)'
};
const SKILL_ICONS = {
    Vocabulary: '📚', Grammar: '📝', Reading: '📖', Listening: '🎧'
};

function adjustSkillQ(delta) {
    const inp = document.getElementById('skill-q-count');
    if (!inp) return;
    let val = parseInt(inp.value || 4) + delta;
    val = Math.max(2, Math.min(20, val));
    inp.value = val;
}

function renderQuestion() {
    const { questions, current, _container, _progBar, _progTxt, _scoreDisplay, _scoreDetail } = quizState;
    if (current >= questions.length) return showFinalScore();

    const q = questions[current];
    const total = questions.length;
    const skill = q.skill || 'General';
    const color = SKILL_COLORS[skill] || 'var(--accent)';
    const icon = SKILL_ICONS[skill] || '❓';
    const labels = ['A','B','C','D'];

    const progTxtEl = document.getElementById(_progTxt || 'ielts-prog-txt');
    const progBarEl = document.getElementById(_progBar || 'ielts-prog-bar');
    if (progTxtEl) progTxtEl.textContent = (current+1) + '/' + total;
    if (progBarEl) progBarEl.style.width = Math.round((current/total)*100) + '%';

    const containerId = _container || 'ielts-quiz-container';
    document.getElementById(containerId).innerHTML =
        '<div class="card">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">'
        + '<div style="display:flex;align-items:center;gap:8px">'
        + '<span style="background:rgba(255,255,255,0.06);border:1px solid ' + color + ';color:' + color + ';padding:4px 12px;border-radius:20px;font-size:11px;font-weight:800;letter-spacing:0.5px">' + icon + ' ' + skill.toUpperCase() + '</span>'
        + '</div>'
        + '<span style="font-size:12px;color:var(--text3);font-family:\'JetBrains Mono\',monospace">Câu ' + (current+1) + '/' + total + '</span>'
        + '</div>'
        + '<div class="quiz-question" style="font-size:16px;font-weight:600;line-height:1.7;margin-bottom:18px;color:var(--text)">' + q.q + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:10px" id="quiz-opts-wrap">'
        + labels.map((lbl, i) => {
            if (!q.opts[i]) return '';
            return '<button onclick="answerQuiz(' + i + ')" class="quiz-opt-btn" '
                + 'style="display:flex;align-items:center;gap:14px;padding:13px 18px;border-radius:12px;border:1px solid var(--border2);background:rgba(255,255,255,0.02);cursor:pointer;transition:all 0.2s;font-size:14px;text-align:left;color:var(--text);width:100%;font-family:\'DM Sans\',sans-serif">'
                + '<span style="width:30px;height:30px;border-radius:8px;background:rgba(255,255,255,0.06);border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;color:var(--text3)">' + lbl + '</span>'
                + '<span>' + q.opts[i].replace(/^[A-D]\.\s*/,'') + '</span>'
                + '</button>';
        }).join('')
        + '</div>'
        + '<div id="answer-reveal" class="answer-reveal"></div>'
        + '</div>';
}

function answerQuiz(idx) {
    const { questions, current } = quizState;
    const q = questions[current];
    const labels = ['A','B','C','D'];
    const skill = q.skill || 'General';

    document.querySelectorAll('.quiz-opt-btn').forEach((btn, i) => {
        btn.disabled = true;
        btn.style.cursor = 'default';
        const lbl = btn.querySelector('span:first-child');
        if (i === q.ans) {
            btn.style.borderColor = 'var(--green)';
            btn.style.background = 'rgba(16,185,129,0.1)';
            lbl.style.background = 'var(--green)';
            lbl.style.color = '#fff';
            lbl.style.borderColor = 'var(--green)';
        } else if (i === idx && i !== q.ans) {
            btn.style.borderColor = 'var(--red)';
            btn.style.background = 'rgba(239,68,68,0.08)';
            lbl.style.background = 'var(--red)';
            lbl.style.color = '#fff';
            lbl.style.borderColor = 'var(--red)';
        }
    });

    const correct = idx === q.ans;
    if (correct) quizState.score++;
    if (quizState.skillScores[skill]) {
        quizState.skillScores[skill].total++;
        if (correct) quizState.skillScores[skill].correct++;
    }

    const pct = Math.round((quizState.score / (current + 1)) * 100);
    const scoreEl = document.getElementById(quizState._scoreDisplay || 'ielts-score-display');
    const scoreDetail = document.getElementById(quizState._scoreDetail || 'ielts-score-detail');
    if (scoreEl) scoreEl.textContent = pct + '%';
    if (scoreDetail) scoreDetail.textContent = quizState.score + '/' + (current+1) + ' correct';

    const reveal = document.getElementById('answer-reveal');
    reveal.classList.add('show');
    reveal.style.background = correct ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.07)';
    reveal.style.border = '1px solid ' + (correct ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.2)');
    reveal.innerHTML = '<strong style="color:' + (correct ? 'var(--green)' : 'var(--red)') + '">'
        + (correct ? '✓ Correct!' : '✗ Sai — Đáp án đúng: ' + labels[q.ans] + '. ' + (q.opts[q.ans]||'').replace(/^[A-D]\.\s*/,''))
        + '</strong><br><br><span style="color:var(--text2)">💡 ' + q.explain + '</span>';

    quizState.current++;
    setTimeout(renderQuestion, 2200);
}

function showFinalScore() {
    const { score, questions, skillScores, _container, _scoreDisplay, _scoreDetail, _progBar, _examType } = quizState;
    const pct = Math.round((score / questions.length) * 100);
    const trophy = pct >= 80 ? '🏆' : pct >= 60 ? '🎯' : '📚';
    const msg = pct >= 80 ? 'Xuất sắc! Bạn đã thành thạo!' : pct >= 60 ? 'Tốt lắm! Tiếp tục cố gắng!' : 'Hãy ôn luyện thêm nhé!';

    const progBarEl = document.getElementById(_progBar || 'ielts-prog-bar');
    const scoreEl = document.getElementById(_scoreDisplay || 'ielts-score-display');
    const scoreDetailEl = document.getElementById(_scoreDetail || 'ielts-score-detail');
    if (progBarEl) progBarEl.style.width = '100%';
    if (scoreEl) scoreEl.textContent = pct + '%';
    if (scoreDetailEl) scoreDetailEl.textContent = '✓ Hoàn thành! ' + score + '/' + questions.length + ' đúng';

    const breakdown = Object.entries(skillScores).map(([skill, data]) => {
        if (data.total === 0) return '';
        const sp = Math.round((data.correct / data.total) * 100);
        const color = SKILL_COLORS[skill] || 'var(--accent)';
        const icon = SKILL_ICONS[skill] || '❓';
        return '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:10px;border:1px solid var(--border2)">'
            + '<span style="font-size:16px">' + icon + '</span>'
            + '<span style="flex:1;font-size:13px;font-weight:600;color:var(--text)">' + skill + '</span>'
            + '<div style="width:80px;height:6px;background:var(--bg3);border-radius:10px;overflow:hidden"><div style="height:100%;width:' + sp + '%;background:' + color + ';border-radius:10px"></div></div>'
            + '<span style="font-size:13px;font-weight:800;color:' + color + ';min-width:38px;text-align:right">' + data.correct + '/' + data.total + '</span>'
            + '</div>';
    }).join('');

    const containerId = _container || 'ielts-quiz-container';
    document.getElementById(containerId).innerHTML =
        '<div class="card" style="text-align:center;padding:32px">'
        + '<div style="font-size:56px;margin-bottom:12px">' + trophy + '</div>'
        + '<div style="font-family:\'Syne\',sans-serif;font-size:52px;font-weight:900;color:var(--accent)">' + pct + '%</div>'
        + '<div style="color:var(--text2);margin:8px 0;font-size:15px">' + score + '/' + questions.length + ' câu đúng</div>'
        + '<div style="color:var(--text3);font-size:13px;margin-bottom:24px">' + msg + '</div>'
        + (breakdown ? '<div style="text-align:left;margin-bottom:24px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin-bottom:10px">Kết quả theo kỹ năng</div><div style="display:flex;flex-direction:column;gap:8px">' + breakdown + '</div></div>' : '')
        + '<button class="btn" onclick="generateQuiz(\'' + (_examType||'IELTS') + '\')" style="width:100%;padding:14px"><i class="fa-solid fa-rotate"></i> Tạo đề mới</button>'
        + '</div>';
}


// ─── 6. AI CHAT ───
const chatHistory = [];
let _chatAttachments = []; // [{type:'image'|'file', name, data, mimeType}]

async function callAIWithVision(prompt, system, attachments) {
    try {
        const userContent = [];
        // Add images
        attachments.filter(a => a.type === 'image').forEach(img => {
            userContent.push({ type: 'image_url', image_url: { url: 'data:' + img.mimeType + ';base64,' + img.data } });
        });
        // Add file text as text block
        attachments.filter(a => a.type === 'file').forEach(f => {
            userContent.push({ type: 'text', text: `[File: ${f.name}]\n${f.data}` });
        });
        userContent.push({ type: 'text', text: prompt });

        const messages = [];
        if (system) messages.push({ role: 'system', content: system });
        messages.push({ role: 'user', content: userContent });

        const r = await fetch(getProxyBase() + '/api/vision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'meta-llama/llama-4-scout-17b-16e-instruct', max_tokens: 2000, messages })
        });
        const d = await r.json();
        if (d.choices && d.choices[0]) return d.choices[0].message.content.replace(/```[\w]*\n?/g,'').replace(/```/g,'').trim();
        if (d.error) {
            if (d.error.code === 'invalid_api_key' || d.error.status === 401) {
                S.apiKey = ''; localStorage.removeItem('ass_api_key_v2'); updateStatus(false); showModal();
                return '❌ API Key không hợp lệ.';
            }
            return `Lỗi API: ${d.error.message}`;
        }
        return 'AI không trả về kết quả.';
    } catch (e) { return `Lỗi kết nối: ${e.message}`; }
}

async function sendChat() {
    const inp = document.getElementById('chat-input');
    const msg = inp.value.trim();
    if (!msg && _chatAttachments.length === 0) return;
    
    const attachments = [..._chatAttachments];
    inp.value = '';
    clearChatAttachments();

    // Show user message with attachments
    appendMsgWithAttachments('user', msg, attachments);
    chatHistory.push({ role: 'user', content: msg || '[Gửi file/ảnh]' });

    const thinkId = appendThinking();
    let r;
    const system = 'You are AI Supper Support — a comprehensive English learning assistant. Help solve exercises, explain concepts, analyze documents. Answer clearly with real examples. Use both English and Vietnamese when helpful.';
    
    if (attachments.length > 0) {
        r = await callAIWithVision(msg || 'Hãy phân tích và giải bài tập trong file/ảnh này. Giải thích từng bước.', system, attachments);
    } else {
        r = await callAI(msg, system);
    }
    removeThinking(thinkId);
    appendMsg('ai', r);
    chatHistory.push({ role: 'assistant', content: r });
}

function quickChat(msg) { document.getElementById('chat-input').value = msg; sendChat(); }

function clearChatAttachments() {
    _chatAttachments = [];
    renderChatAttachmentPreviews();
}

// ─── Plus menu toggle ───
function togglePlusMenu() {
    const menu = document.getElementById('chat-plus-menu');
    const btn  = document.getElementById('chat-plus-btn');
    if (!menu) return;
    const isOpen = menu.classList.contains('open');
    menu.classList.toggle('open', !isOpen);
    btn.classList.toggle('active', !isOpen);
}
// Close menu on outside click
document.addEventListener('click', e => {
    const menu = document.getElementById('chat-plus-menu');
    const btn  = document.getElementById('chat-plus-btn');
    if (menu && !menu.contains(e.target) && btn && !btn.contains(e.target)) {
        menu.classList.remove('open');
        btn.classList.remove('active');
    }
});

function renderChatAttachmentPreviews() {
    const prev = document.getElementById('chat-attach-preview');
    if (!prev) return;
    if (_chatAttachments.length === 0) { prev.style.display = 'none'; prev.innerHTML = ''; return; }
    prev.style.display = 'flex';
    prev.className = 'chat-attach-chips';
    prev.innerHTML = _chatAttachments.map((a, i) => `
        <div class="attach-chip">
            ${a.type === 'image'
                ? `<img src="data:${a.mimeType};base64,${a.data}" alt="">`
                : `<i class="fa-solid fa-file-lines" style="color:var(--accent2);font-size:16px"></i>`}
            <span style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.name}</span>
            <button class="attach-chip-remove" onclick="removeChatAttachment(${i})"><i class="fa-solid fa-xmark"></i></button>
        </div>`).join('');
}

function removeChatAttachment(idx) {
    _chatAttachments.splice(idx, 1);
    renderChatAttachmentPreviews();
}

async function handleChatFileUpload(e) {
    const files = Array.from(e.target.files);
    e.target.value = '';
    for (const file of files) {
        if (file.type.startsWith('image/')) {
            const data = await readFileAsBase64(file);
            _chatAttachments.push({ type: 'image', name: file.name, data, mimeType: file.type });
        } else {
            // PDF, DOCX, TXT
            let text = '';
            try {
                if (file.name.endsWith('.pdf')) {
                    const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise;
                    for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) { const pg = await pdf.getPage(i); const tc = await pg.getTextContent(); text += tc.items.map(t => t.str).join(' ') + '\n'; }
                } else if (file.name.endsWith('.docx')) {
                    const res = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
                    text = res.value;
                } else {
                    text = await file.text();
                }
            } catch(err) { text = '[Không đọc được file: ' + err.message + ']'; }
            _chatAttachments.push({ type: 'file', name: file.name, data: text.slice(0, 4000), mimeType: file.type });
        }
    }
    renderChatAttachmentPreviews();
}

function readFileAsBase64(file) {
    return new Promise(resolve => {
        const r = new FileReader();
        r.onload = e => resolve(e.target.result.split(',')[1]);
        r.readAsDataURL(file);
    });
}

function appendMsgWithAttachments(role, text, attachments) {
    const box = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    let content = '';
    if (attachments.length > 0) {
        content += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">';
        attachments.forEach(a => {
            if (a.type === 'image') {
                content += `<img src="data:${a.mimeType};base64,${a.data}" style="max-width:200px;max-height:150px;border-radius:8px;object-fit:cover;border:1px solid var(--border)">`;
            } else {
                content += `<div style="display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.06);border:1px solid var(--border2);border-radius:8px;padding:6px 10px;font-size:12px"><i class="fa-solid fa-file-lines" style="color:var(--accent2)"></i><span>${a.name}</span></div>`;
            }
        });
        content += '</div>';
    }
    if (text) content += `<span>${text}</span>`;
    div.innerHTML = `<div class="avatar ${role}">${role === 'ai' ? '<i class="fa-solid fa-microchip"></i>' : '<i class="fa-solid fa-user"></i>'}</div><div class="bubble ${role}">${content}</div>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

// Chat search functionality
let _chatSearchActive = false;
function toggleChatSearch() {
    _chatSearchActive = !_chatSearchActive;
    const sb = document.getElementById('chat-search-bar');
    if (sb) {
        sb.style.display = _chatSearchActive ? 'flex' : 'none';
        if (_chatSearchActive) sb.querySelector('input').focus();
        else { sb.querySelector('input').value = ''; highlightChatSearch(''); }
    }
}

function highlightChatSearch(q) {
    const msgs = document.querySelectorAll('#chat-messages .bubble');
    msgs.forEach(b => {
        const text = b.textContent;
        if (!q) { b.style.outline = ''; return; }
        if (text.toLowerCase().includes(q.toLowerCase())) {
            b.style.outline = '2px solid var(--gold)';
            b.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            b.style.outline = '';
        }
    });
}

function clearChatHistory() {
    if (!confirm('Xóa toàn bộ lịch sử chat?')) return;
    chatHistory.length = 0;
    const box = document.getElementById('chat-messages');
    box.innerHTML = `<div class="msg"><div class="avatar ai"><i class="fa-solid fa-microchip"></i></div><div class="bubble ai">Chat đã được làm mới. Tôi sẵn sàng giúp bạn! 🎓<br><br>Bạn có thể gửi <strong>tin nhắn</strong>, <strong>ảnh</strong>, hoặc <strong>file</strong> để AI giải bài giúp bạn.</div></div>`;
}

function formatMsgText(text) {
    return text
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
        .replace(/\*(.+?)\*/g,'<em>$1</em>')
        .replace(/`([^`]+)`/g,'<code style="background:rgba(59,130,246,0.15);padding:2px 6px;border-radius:4px;font-family:monospace;font-size:12px">$1</code>')
        .replace(/^#{3}\s(.+)$/gm,'<div style="font-weight:800;font-size:15px;margin:12px 0 4px;color:var(--text)">$1</div>')
        .replace(/^#{2}\s(.+)$/gm,'<div style="font-weight:800;font-size:16px;margin:14px 0 6px;color:var(--text)">$1</div>')
        .replace(/^•\s/gm,'<span style="color:var(--accent);margin-right:6px">▸</span>')
        .replace(/\n/g,'<br>');
}
function appendMsg(role, text) {
    const box = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    const avatarIcon = role === 'ai'
        ? '<i class="fa-solid fa-microchip"></i>'
        : '<i class="fa-solid fa-user"></i>';
    div.innerHTML = `<div class="avatar ${role}">${avatarIcon}</div><div class="bubble ${role}">${formatMsgText(text)}</div>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}
function appendThinking() {
    const id = 'think-' + Date.now();
    document.getElementById('chat-messages').innerHTML += `<div class="msg" id="${id}"><div class="avatar ai"><i class="fa-solid fa-microchip"></i></div><div class="bubble ai thinking"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>`;
    document.getElementById('chat-messages').scrollTop = 99999;
    return id;
}
function removeThinking(id) { document.getElementById(id)?.remove(); }
let _micActive = false;
let _micRecognizer = null;
function toggleMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert('Trình duyệt không hỗ trợ microphone. Hãy dùng Chrome.');
    const btn = document.getElementById('mic-btn');
    const bar = document.getElementById('voice-recording-bar');

    if (_micActive && _micRecognizer) {
        _micRecognizer.stop();
        _micActive = false;
        btn.classList.remove('recording');
        btn.querySelector('i').className = 'fa-solid fa-microphone';
        if (bar) bar.classList.remove('active');
        return;
    }

    const rec = new SR();
    rec.lang = 'vi-VN'; // bi-lingual: try Vietnamese first, works for English too
    rec.continuous = false;
    rec.interimResults = true;
    _micRecognizer = rec;
    _micActive = true;

    btn.classList.add('recording');
    btn.querySelector('i').className = 'fa-solid fa-circle-stop';

    rec.start();
    if (bar) bar.classList.add('active');

    rec.onresult = e => {
        const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
        const inp = document.getElementById('chat-input');
        if (inp) { inp.value = transcript; autoresizeChat(inp); }
        const lvl = document.getElementById('voice-level-bar');
        if (lvl) lvl.style.width = Math.min(100, 20 + Math.random() * 60) + '%';
    };
    rec.onend = () => {
        _micActive = false;
        btn.classList.remove('recording');
        btn.querySelector('i').className = 'fa-solid fa-microphone';
        if (bar) bar.classList.remove('active');
        _micRecognizer = null;
    };
    rec.onerror = () => {
        _micActive = false;
        btn.classList.remove('recording');
        btn.querySelector('i').className = 'fa-solid fa-microphone';
        if (bar) bar.classList.remove('active');
        _micRecognizer = null;
    };
}

function autoresizeChat(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(140, el.scrollHeight) + 'px';
}

async function handleChatImagePaste() {
    // Try clipboard image
    try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
            for (const type of item.types) {
                if (type.startsWith('image/')) {
                    const blob = await item.getType(type);
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                        const base64 = e.target.result.split(',')[1];
                        _chatAttachments.push({ type: 'image', name: 'clipboard.png', data: base64, mimeType: type });
                        renderChatAttachmentPreviews();
                    };
                    reader.readAsDataURL(blob);
                    return;
                }
            }
        }
        alert('Không có ảnh trong clipboard. Hãy dùng nút 📎 để đính kèm file.');
    } catch(e) {
        alert('Không đọc được clipboard. Hãy dùng Ctrl+V trực tiếp vào ô chat, hoặc nút 📎 để đính kèm file.');
    }
}

// Paste image directly into chat input
document.addEventListener('paste', function(e) {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) {
                const reader = new FileReader();
                reader.onload = ev => {
                    const base64 = ev.target.result.split(',')[1];
                    _chatAttachments.push({ type: 'image', name: 'pasted-image.png', data: base64, mimeType: file.type });
                    renderChatAttachmentPreviews();
                };
                reader.readAsDataURL(file);
            }
        }
    }
});

// ─── STATS ───
function updateHomeStats() {
    const vc = document.getElementById('vocab-count-home');
    const fc = document.getElementById('file-count-home');
    if (vc) vc.textContent = S.words.length;
    if (fc) fc.textContent = S.files.length;
    document.getElementById('daily-count').textContent = S.dailyCount;
}

// ─── STREAK ───
function checkStreak() {
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now()-86400000).toDateString();
    if (S.lastVisit !== today) {
        S.streak = S.lastVisit === yesterday ? S.streak + 1 : 1;
        localStorage.setItem('ass_last_visit', today);
        localStorage.setItem('ass_streak', S.streak);
    }
    document.getElementById('streak-val').textContent = S.streak;
}

// ─── CANVAS BACKGROUND ───
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
let pts = [];
function initCanvas() {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    pts = Array.from({length:55}, () => ({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, vx: (Math.random()-0.5)*0.4, vy: (Math.random()-0.5)*0.4, r: Math.random()*1.5+0.5 }));
}
function drawCanvas() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pts.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if(p.x<0||p.x>canvas.width) p.vx*=-1;
        if(p.y<0||p.y>canvas.height) p.vy*=-1;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle='rgba(59,130,246,0.35)'; ctx.fill();
    });
    for(let i=0;i<pts.length;i++) for(let j=i+1;j<pts.length;j++) {
        const dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y, dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<140) { ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y); ctx.strokeStyle=`rgba(59,130,246,${0.12*(1-dist/140)})`; ctx.lineWidth=0.8; ctx.stroke(); }
    }
    requestAnimationFrame(drawCanvas);
}

// ═══════════════════════════════════════════
//  PERMISSION SYSTEM
// ═══════════════════════════════════════════
var ALL_FEATURES = [
    { id: 'translate',  label: 'AI Translator',      icon: 'fa-earth-asia',      desc: 'Dịch thuật tự động AI' },
    { id: 'vocab',      label: 'Vocabulary Bank',     icon: 'fa-book-bookmark',   desc: 'Quản lý từ vựng cá nhân' },
    { id: 'files',      label: 'File & AI Solver',    icon: 'fa-file-circle-check', desc: 'Upload & AI giải bài tập' },
    { id: 'ielts',      label: 'IELTS Lab',           icon: 'fa-spell-check',     desc: 'Luyện 4 kỹ năng IELTS Band 7+' },
    { id: 'toeic',      label: 'TOEIC Lab',           icon: 'fa-briefcase',       desc: 'Luyện TOEIC Part 1-7 score 850+' },
    { id: 'chat',       label: 'AI Research Coach',   icon: 'fa-comments',        desc: 'Chat hỏi đáp AI với ảnh + giọng nói' }
];
function getDefaultPermissions(role) { return ALL_FEATURES.map(f => f.id); }
function getUserPermissions(user) {
    if (!user) return [];
    if (user.role === 'admin') return ALL_FEATURES.map(f => f.id);
    return user.permissions || getDefaultPermissions(user.role);
}
function hasPermission(featureId) {
    var user = getCurrentUser(); if (!user) return false;
    if (user.role === 'admin') return true;
    return getUserPermissions(user).indexOf(featureId) >= 0;
}
function applyPermissions(user) {
    var perms = getUserPermissions(user);
    ALL_FEATURES.forEach(f => {
        var allowed = user.role === 'admin' || perms.indexOf(f.id) >= 0;
        document.querySelectorAll(`[onclick*="goTo('${f.id}')"]`).forEach(btn => {
            btn.style.opacity = allowed ? '1' : '0.35';
            btn.title = allowed ? '' : 'Locked by admin';
            if (!allowed) btn.onclick = () => alert('Feature locked. Contact admin.');
        });
    });
}

// ═══════════════════════════════════════════
//  AUTH & USER SYSTEM — FIREBASE VERSION
// ═══════════════════════════════════════════

// Lấy toàn bộ users từ Firebase
async function getUsers() {
    const data = await fbGet('users');
    if (data && typeof data === 'object') {
        // ✅ Fix: lọc bỏ giá trị null/undefined, đảm bảo array hợp lệ
        const users = Object.values(data).filter(u => u && u.id && u.username);
        if (users.length > 0) return users;
    }
    // Tạo admin mặc định nếu chưa có
    const defaultAdmin = {
        id: 1, username: 'admin', password: btoa('admin123'),
        displayName: 'Administrator', role: 'admin', status: 'active',
        createdAt: new Date().toISOString(), lastActive: new Date().toISOString(),
        translations: 0, loginCount: 0
    };
    await fbSet('users/1', defaultAdmin);
    return [defaultAdmin];
}

// Lưu 1 user lên Firebase (dùng id làm key)
async function saveOneUser(user) {
    await fbSet(`users/${user.id}`, user);
}

// Lưu toàn bộ danh sách users (dùng khi cần update nhiều)
async function saveUsers(users) {
    const obj = {};
    users.forEach(u => { obj[u.id] = u; });
    await fbSet('users', obj);
}

// Activity log — Firebase
async function getActivityLog() {
    const data = await fbGet('activity_log');
    if (!data) return [];
    // ✅ Fix: sort theo timestamp số (chính xác), fallback về time string
    return Object.values(data).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

async function logActivity(msg, type) {
    if (!type) type = 'info';
    try {
        const cu = getCurrentUser();
        const now = new Date();
        await fbPush('activity_log', {
            msg, type,
            time: now.toLocaleString('vi-VN'),
            timestamp: now.getTime(), // ✅ Fix: lưu timestamp số để sort đúng
            user: cu ? cu.username : 'system'
        });
    } catch(e) { console.warn('logActivity error:', e); }
}
function logActivitySafe(msg, type) { logActivity(msg, type); } // alias

// Session (vẫn dùng sessionStorage — chỉ lưu user hiện tại đang đăng nhập)
function getCurrentUser() {
    const s = sessionStorage.getItem('ass_session');
    return s ? JSON.parse(s) : null;
}
function setCurrentUser(user) {
    sessionStorage.setItem('ass_session', JSON.stringify(user));
}

// ─── AUTH UI ───
function switchAuthTab(tab) {
    document.getElementById('auth-form-login').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('auth-form-register').style.display = tab === 'register' ? 'block' : 'none';
    document.getElementById('tab-login').style.background = tab === 'login' ? 'rgba(59,130,246,0.15)' : 'transparent';
    document.getElementById('tab-login').style.borderColor = tab === 'login' ? 'var(--accent)' : 'var(--border2)';
    document.getElementById('tab-login').style.color = tab === 'login' ? 'var(--text)' : 'var(--text2)';
    document.getElementById('tab-register').style.background = tab === 'register' ? 'rgba(139,92,246,0.15)' : 'transparent';
    document.getElementById('tab-register').style.borderColor = tab === 'register' ? 'var(--accent2)' : 'var(--border2)';
    document.getElementById('tab-register').style.color = tab === 'register' ? 'var(--text)' : 'var(--text2)';
    document.getElementById('auth-error').style.display = 'none';
}
function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent = msg; el.style.display = 'block';
}

async function doLogin() {
    try {
        const username = document.getElementById('auth-username').value.trim();
        const password = document.getElementById('auth-password').value;
        if (!username || !password) return showAuthError('Please fill in all fields.');
        showAuthError('⏳ Đang đăng nhập...');
        const users = await getUsers();
        const user = users.find(u => u.username === username && u.password === btoa(password));
        if (!user) return showAuthError('Invalid username or password.');
        if (user.status === 'banned') return showAuthError('Your account has been suspended. Contact admin.');
        user.lastActive = new Date().toISOString();
        user.loginCount = (user.loginCount || 0) + 1;
        if (!user.permissions) user.permissions = getDefaultPermissions(user.role);
        await saveOneUser(user);
        setCurrentUser(user);
        await logActivity(`User "${user.username}" signed in`, 'login');
        document.getElementById('auth-overlay').style.display = 'none';
        onLoginSuccess(user);
    } catch(err) {
        showAuthError('Login error: ' + err.message);
        console.error('doLogin error:', err);
    }
}

async function doRegister() {
    const username = document.getElementById('reg-username').value.trim();
    const display = document.getElementById('reg-display').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    if (!username || !display || !password) return showAuthError('Please fill in all fields.');
    if (password !== confirm) return showAuthError('Passwords do not match.');
    if (password.length < 6) return showAuthError('Password must be at least 6 characters.');
    if (!/^[a-zA-Z0-9_ ]+$/.test(username)) return showAuthError('Username: letters, numbers, underscore, space only.');
    showAuthError('⏳ Đang tạo tài khoản...');
    const users = await getUsers();
    if (users.find(u => u.username === username)) return showAuthError('Username already taken.');
    const newUser = {
        id: Date.now(), username, password: btoa(password), displayName: display,
        role: 'user', status: 'active', createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(), translations: 0, loginCount: 1,
        permissions: getDefaultPermissions('user')
    };
    await saveOneUser(newUser);
    setCurrentUser(newUser);
    await logActivity(`New user "${username}" registered`, 'register');
    document.getElementById('auth-overlay').style.display = 'none';
    onLoginSuccess(newUser);
}

function onLoginSuccess(user) {
    if (user.role === 'admin' || user.role === 'moderator') {
        document.getElementById('admin-nav-btn').style.display = 'flex';
    }
    const roleColor = getRoleColor(user.role);
    const aiStatus = S.apiKey ? ' · AI Online' : '';
    document.querySelectorAll('.ai-badge').forEach(b => {
        b.innerHTML = `<span style="color:${roleColor}">${getRoleBadge(user.role)}</span> ${user.displayName}<span style="opacity:0.6;font-size:10px"> ${aiStatus}</span>`;
    });
    applyPermissions(user);
    const origUpdate = window.updateHomeStats;
    window.updateHomeStats = async function() {
        if (origUpdate) origUpdate();
        const users = await getUsers();
        const u = users.find(x => x.id === user.id);
        if (u) { u.translations = S.dailyCount; u.lastActive = new Date().toISOString(); await saveOneUser(u); }
    };

    // ── Heartbeat: update lastActive every 3 minutes so admin can see "Online" ──
    async function _heartbeat() {
        const users = await getUsers();
        const u = users.find(x => x.id === user.id);
        if (u) { u.lastActive = new Date().toISOString(); await saveOneUser(u); }
    }
    _heartbeat();
    setInterval(_heartbeat, 3 * 60 * 1000); // every 3 min
}

async function doLogout() {
    await logActivity(`User "${getCurrentUser()?.username}" signed out`, 'logout');
    sessionStorage.removeItem('ass_session');
    location.reload();
}

// ─── ADMIN PANEL ───
let _adminTab = 'overview';
let _adminAutoRefresh = null;

function switchAdminTab(tab) {
    _adminTab = tab;
    const titles = {
        overview: '<i class="fa-solid fa-chart-pie" style="color:var(--accent);margin-right:8px"></i>Overview',
        users: '<i class="fa-solid fa-users" style="color:var(--accent2);margin-right:8px"></i>Quản lý Users',
        activity: '<i class="fa-solid fa-chart-line" style="color:var(--green);margin-right:8px"></i>Activity Log',
        announce: '<i class="fa-solid fa-bullhorn" style="color:var(--gold);margin-right:8px"></i>Thông báo',
        system: '<i class="fa-solid fa-gear" style="margin-right:8px"></i>Hệ thống'
    };
    ['overview','users','activity','announce','system'].forEach(t => {
        const el = document.getElementById('atab-' + t);
        const nav = document.getElementById('anav-' + t);
        if (el) el.style.display = t === tab ? 'block' : 'none';
        if (nav) {
            nav.classList.toggle('active', t === tab);
        }
    });
    const titleEl = document.getElementById('admin-page-title');
    if (titleEl) titleEl.innerHTML = titles[tab] || tab;
    if (tab === 'users') { renderAdminUsers(); loadAnnounceUserList(); }
    if (tab === 'activity') renderActivityLog();
    if (tab === 'announce') { renderAnnounceHistory(); loadAnnounceUserList(); }
    if (tab === 'system') refreshSystemStatus();
}

async function openAdmin() {
    const user = getCurrentUser();
    if (!user || (user.role !== 'admin' && user.role !== 'moderator')) return alert('Access denied.');
    const panel = document.getElementById('admin-panel');
    panel.style.display = 'block';
    switchAdminTab('overview');
    await refreshAdmin();
    // Auto-refresh every 30s
    clearInterval(_adminAutoRefresh);
    _adminAutoRefresh = setInterval(async () => {
        if (document.getElementById('admin-panel').style.display !== 'none') {
            await renderAdminStats();
            await renderOnlineUsers();
            if (_adminTab === 'activity') renderActivityLog();
        }
    }, 30000);
}

function closeAdmin() {
    document.getElementById('admin-panel').style.display = 'none';
    clearInterval(_adminAutoRefresh);
}

async function refreshAdmin() {
    await renderAdminStats();
    await renderOnlineUsers();
    await renderActivityPreview();
    loadUserNotifications();
    const now = new Date();
    const el = document.getElementById('admin-last-refresh');
    if (el) el.textContent = `Last refreshed: ${now.toLocaleTimeString('vi-VN')}`;
}

// ─── SYSTEM TAB ───
function refreshSystemStatus() {
    const timeEl = document.getElementById('sys-time');
    if (timeEl) timeEl.textContent = new Date().toLocaleString('vi-VN');
    fetch('/api/health').then(r => r.json()).then(d => {
        const groqEl = document.getElementById('sys-groq-status');
        const proxyEl = document.getElementById('sys-proxy-status');
        if (groqEl) groqEl.innerHTML = d.hasKey ? '<span style="color:var(--green)">● Configured</span>' : '<span style="color:var(--red)">● Missing</span>';
        if (proxyEl) proxyEl.innerHTML = '<span style="color:var(--green)">● Online</span>';
    }).catch(() => {
        const proxyEl = document.getElementById('sys-proxy-status');
        if (proxyEl) proxyEl.innerHTML = '<span style="color:var(--red)">● Offline</span>';
    });
}

async function clearAllLogs() {
    if (!confirm('Xóa toàn bộ activity log? Không thể hoàn tác!')) return;
    await fbSet('activity_log', null);
    await logActivity('Admin cleared all activity logs', 'admin');
    alert('Đã xóa toàn bộ log.');
    renderActivityLog();
}

async function exportUsers() {
    const users = await getUsers();
    const blob = new Blob([JSON.stringify(users, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `users_export_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
}

function exportActivityLog() {
    getActivityLog().then(log => {
        const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `activity_log_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
    });
}

// ─── ANNOUNCEMENT ───
async function loadAnnounceUserList() {
    const sel = document.getElementById('announce-target-user');
    if (!sel) return;
    try {
        const users = await getUsers();
        sel.innerHTML = '<option value="">-- Chọn user --</option>';
        if (users && users.length) {
            users.forEach(u => {
                const opt = document.createElement('option');
                opt.value = String(u.id);
                opt.textContent = `${u.displayName || u.username} (@${u.username}) — ${u.role}`;
                sel.appendChild(opt);
            });
        }
    } catch(e) { console.error('loadAnnounceUserList error:', e); }
}

async function sendAnnouncement(target) {
    let type, title, body, targetId = null;
    if (target === 'all') {
        type = document.getElementById('announce-type').value;
        title = document.getElementById('announce-title').value.trim();
        body = document.getElementById('announce-body').value.trim();
    } else {
        type = document.getElementById('announce-type2').value;
        title = document.getElementById('announce-title2').value.trim();
        body = document.getElementById('announce-body2').value.trim();
        targetId = document.getElementById('announce-target-user').value;
        if (!targetId) return alert('Vui lòng chọn user!');
    }
    if (!title || !body) return alert('Vui lòng điền đầy đủ tiêu đề và nội dung.');
    const user = getCurrentUser();
    // Get target display name
    let targetLabel = 'all';
    if (target !== 'all') {
        const users = await getUsers();
        const tUser = users.find(u => String(u.id) === String(targetId));
        targetLabel = tUser ? tUser.displayName || tUser.username : targetId;
    }
    const announce = {
        id: Date.now(), type, title, body,
        target: target === 'all' ? 'all' : String(targetId),
        sentBy: user?.displayName || 'Admin',
        sentAt: new Date().toISOString(),
        readBy: {}
    };
    await fbPush('announcements', announce);
    await logActivity(`Admin sent announcement: "${title}" → ${target === 'all' ? 'Tất cả' : targetLabel}`, 'admin');
    alert('✅ Đã gửi thông báo!');
    if (target === 'all') {
        document.getElementById('announce-title').value = '';
        document.getElementById('announce-body').value = '';
    } else {
        document.getElementById('announce-title2').value = '';
        document.getElementById('announce-body2').value = '';
    }
    renderAnnounceHistory();
}

async function renderAnnounceHistory() {
    const el = document.getElementById('announce-history');
    if (!el) return;
    try {
        const data = await fbGet('announcements');
        if (!data) { el.innerHTML = '<div style="color:var(--text3);font-size:13px;text-align:center;padding:20px">Chưa có thông báo nào.</div>'; return; }
        const list = Object.values(data).reverse().slice(0, 30);
        const typeColor = { info:'var(--accent)', warning:'var(--gold)', success:'var(--green)', error:'var(--red)' };
        const typeIcon  = { info:'fa-circle-info', warning:'fa-triangle-exclamation', success:'fa-circle-check', error:'fa-circle-exclamation' };
        el.innerHTML = list.map(a => `
            <div style="padding:12px 14px;background:rgba(255,255,255,0.03);border:1px solid var(--border2);border-left:3px solid ${typeColor[a.type]||'var(--accent)'};border-radius:10px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                    <i class="fa-solid ${typeIcon[a.type]||'fa-circle-info'}" style="color:${typeColor[a.type]||'var(--accent)'}"></i>
                    <span style="font-weight:700;font-size:13px;color:var(--text)">${a.title}</span>
                    <span style="margin-left:auto;font-size:10px;color:var(--text3)">${new Date(a.sentAt).toLocaleString('vi-VN')}</span>
                </div>
                <div style="font-size:12px;color:var(--text2);margin-bottom:4px">${a.body}</div>
                <div style="font-size:10px;color:var(--text3)">Gửi bởi: ${a.sentBy} · Đến: ${a.target === 'all' ? '🌐 Tất cả' : '👤 User cụ thể'}</div>
            </div>`).join('');
    } catch(e) { el.innerHTML = '<div style="color:var(--red);font-size:13px;padding:12px">Lỗi tải thông báo.</div>'; }
}

// ─── USER NOTIFICATION BELL ───
function toggleNotifDropdown() {
    const dd = document.getElementById('notif-dropdown');
    if (dd) dd.classList.toggle('open');
}

async function loadUserNotifications() {
    const user = getCurrentUser();
    if (!user || !user.id) return;
    try {
        const data = await fbGet('announcements');
        if (!data) return;
        const myNotifs = Object.values(data).filter(a =>
            a.target === 'all' || String(a.target) === String(user.id)
        ).reverse().slice(0, 20);
        const unread = myNotifs.filter(a => !a.readBy || !a.readBy[user.id]);
        // Update badge
        const badge = document.getElementById('notif-badge');
        if (badge) {
            badge.style.display = unread.length > 0 ? 'flex' : 'none';
            badge.textContent = unread.length > 9 ? '9+' : unread.length;
        }
        // Render list
        const list = document.getElementById('notif-list');
        if (!list) return;
        if (myNotifs.length === 0) {
            list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px">Không có thông báo nào</div>';
            return;
        }
        const typeColor = { info:'var(--accent)', warning:'var(--gold)', success:'var(--green)', error:'var(--red)' };
        const typeIcon  = { info:'fa-circle-info', warning:'fa-triangle-exclamation', success:'fa-circle-check', error:'fa-circle-exclamation' };
        list.innerHTML = myNotifs.map(n => `
            <div class="notif-item ${(!n.readBy || !n.readBy[user.uid]) ? 'unread' : ''}" onclick="markNotifRead('${n.id}')">
                <div style="display:flex;align-items:flex-start;gap:10px">
                    <i class="fa-solid ${typeIcon[n.type]||'fa-circle-info'}" style="color:${typeColor[n.type]||'var(--accent)'};margin-top:2px;font-size:13px"></i>
                    <div style="flex:1;min-width:0">
                        <div style="font-weight:700;font-size:13px;color:var(--text)">${n.title}</div>
                        <div style="font-size:12px;color:var(--text2);margin-top:2px">${n.body}</div>
                        <div style="font-size:10px;color:var(--text3);margin-top:4px">${new Date(n.sentAt).toLocaleString('vi-VN')}</div>
                    </div>
                </div>
            </div>`).join('');
    } catch(e) {}
}

async function markNotifRead(notifId) {
    const user = getCurrentUser();
    if (!user) return;
    try {
        const data = await fbGet('announcements');
        if (!data) return;
        const key = Object.keys(data).find(k => data[k].id == notifId);
        if (key) await fbSet(`announcements/${key}/readBy/${user.id}`, true);
        loadUserNotifications();
    } catch(e) {}
}

async function markAllRead() {
    const user = getCurrentUser();
    if (!user) return;
    try {
        const data = await fbGet('announcements');
        if (!data) return;
        for (const key of Object.keys(data)) {
            const a = data[key];
            if ((a.target === 'all' || String(a.target) === String(user.id)) && (!a.readBy || !a.readBy[user.id])) {
                await fbSet(`announcements/${key}/readBy/${user.id}`, true);
            }
        }
        loadUserNotifications();
    } catch(e) {}
}

// Close notif dropdown when clicking outside
document.addEventListener('click', e => {
    const wrap = document.getElementById('notif-bell-wrap');
    if (wrap && !wrap.contains(e.target)) {
        const dd = document.getElementById('notif-dropdown');
        if (dd) dd.classList.remove('open');
    }
});

async function renderOnlineUsers() {
    // "Online" = lastActive within past 10 minutes (tracked via Firebase heartbeat)
    const users = await getUsers();
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    const onlineUsers = users.filter(u => {
        if (!u.lastActive) return false;
        try { return new Date(u.lastActive).getTime() > tenMinAgo; } catch(e) { return false; }
    });
    const countBadge = document.getElementById('online-count-badge');
    const statOnline = document.getElementById('stat-online');
    if (countBadge) countBadge.textContent = onlineUsers.length + ' online';
    if (statOnline) statOnline.textContent = onlineUsers.length;

    const list = document.getElementById('online-users-list');
    if (!list) return;
    if (!onlineUsers.length) {
        list.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px">No users currently online.</div>';
        return;
    }
    list.innerHTML = onlineUsers.map(u => {
        const roleColor = getRoleColor(u.role);
        const lastMs = new Date(u.lastActive).getTime();
        const diffMin = Math.round((Date.now() - lastMs) / 60000);
        const timeLabel = diffMin < 1 ? 'Just now' : diffMin + 'm ago';
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.15);border-radius:10px">
            <div style="width:32px;height:32px;border-radius:10px;background:${roleColor}22;border:1px solid ${roleColor}44;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:${roleColor}">${u.displayName[0].toUpperCase()}</div>
            <div style="flex:1">
                <div style="font-size:13px;font-weight:700;color:var(--text)">${u.displayName}</div>
                <div style="font-size:11px;color:var(--text3)">@${u.username} · ${getRoleBadge(u.role)}</div>
            </div>
            <div style="text-align:right">
                <div style="display:flex;align-items:center;gap:5px"><div style="width:7px;height:7px;border-radius:50%;background:var(--green);animation:pulse 2s infinite"></div><span style="font-size:11px;color:var(--green);font-weight:700">Online</span></div>
                <div style="font-size:10px;color:var(--text3);margin-top:2px">${timeLabel}</div>
            </div>
        </div>`;
    }).join('');
}

async function renderActivityPreview() {
    const log = await getActivityLog();
    const preview = document.getElementById('activity-log-preview');
    if (!preview) return;
    const typeColor = { login: 'var(--green)', logout: 'var(--text2)', register: 'var(--accent)', admin: 'var(--accent2)', info: 'var(--text3)' };
    const typeIcon  = { login: 'fa-right-to-bracket', logout: 'fa-right-from-bracket', register: 'fa-user-plus', admin: 'fa-shield-halved', info: 'fa-circle-info' };
    preview.innerHTML = log.slice(0, 10).map(l => `
        <div style="display:flex;gap:10px;align-items:center;padding:9px 12px;background:rgba(255,255,255,0.02);border-radius:10px;border:1px solid var(--border2);transition:background 0.15s" onmouseenter="this.style.background='rgba(255,255,255,0.04)'" onmouseleave="this.style.background='rgba(255,255,255,0.02)'">
            <div style="width:28px;height:28px;border-radius:8px;background:${typeColor[l.type]||'var(--text3)'}18;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <i class="fa-solid ${typeIcon[l.type]||'fa-circle'}" style="font-size:11px;color:${typeColor[l.type]||'var(--text3)'}"></i>
            </div>
            <div style="flex:1;font-size:12px;color:var(--text)">${l.msg}</div>
            <div style="font-size:10px;color:var(--text3);white-space:nowrap;font-family:'JetBrains Mono',monospace">${l.time}</div>
        </div>`).join('') || '<div style="color:var(--text3);text-align:center;padding:20px;font-size:13px">No activity yet.</div>';
}

async function renderAdminStats() {
    const users = await getUsers();
    const todayStr = new Date().toLocaleDateString('vi-VN');
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    document.getElementById('stat-total').textContent = users.length;
    document.getElementById('stat-active').textContent = users.filter(u => {
        if (!u.lastActive) return false;
        try { return new Date(u.lastActive).toLocaleDateString('vi-VN') === todayStr; } catch(e) { return false; }
    }).length;
    document.getElementById('stat-admins').textContent = users.filter(u => u.role === 'admin').length;
    document.getElementById('stat-mods').textContent = users.filter(u => u.role === 'moderator').length;
    document.getElementById('stat-banned').textContent = users.filter(u => u.status === 'banned').length;
    // Online count
    const onlineCnt = users.filter(u => { try { return new Date(u.lastActive).getTime() > tenMinAgo; } catch(e){ return false; } }).length;
    const statOnline = document.getElementById('stat-online');
    if (statOnline) statOnline.textContent = onlineCnt;
}

function getRoleColor(role) {
    if (role === 'admin') return 'var(--accent2)';
    if (role === 'moderator') return 'var(--gold)';
    return 'var(--text2)';
}
function getRoleBadge(role) {
    if (role === 'admin') return '<i class="fa-solid fa-shield-halved" style="margin-right:5px;color:var(--accent2)"></i>Admin';
    if (role === 'moderator') return '<i class="fa-solid fa-bolt" style="margin-right:5px;color:var(--gold)"></i>Moderator';
    return '<i class="fa-solid fa-user" style="margin-right:5px;color:var(--text2)"></i>User';
}

function filterAdminUsers(role) {
    renderAdminUsers(document.querySelector('#atab-users input[type=text]')?.value || '', role);
}

async function renderAdminUsers(search, roleFilter) {
    if (search === undefined) search = '';
    if (roleFilter === undefined) roleFilter = document.getElementById('user-role-filter')?.value || '';
    const users = await getUsers();
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    let filtered = users;
    if (search) filtered = filtered.filter(u => u.username.toLowerCase().includes(search.toLowerCase()) || u.displayName.toLowerCase().includes(search.toLowerCase()));
    if (roleFilter) filtered = filtered.filter(u => u.role === roleFilter);
    const tbody = document.getElementById('admin-tbody');
    const currentUser = getCurrentUser();
    const isSuperAdmin = currentUser && currentUser.role === 'admin';
    tbody.innerHTML = filtered.map(u => {
        const roleColor = getRoleColor(u.role);
        const roleBadge = getRoleBadge(u.role);
        const statusColor = u.status === 'active' ? 'var(--green)' : 'var(--red)';
        const lastActive = u.lastActive ? new Date(u.lastActive).toLocaleString('vi-VN') : 'Never';
        const isCurrentUser = u.id === (currentUser && currentUser.id);
        const isOnline = u.lastActive && new Date(u.lastActive).getTime() > tenMinAgo;
        const onlineDot = isOnline
            ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--green);margin-right:5px;animation:pulse 2s infinite"></span>'
            : '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--text3);margin-right:5px;opacity:0.5"></span>';
        const banIcon = u.status === 'banned' ? 'lock-open' : 'ban';
        const banLabel = u.status === 'banned' ? 'Unban' : 'Ban';
        let roleMenuItems = '';
        if (isSuperAdmin && !isCurrentUser) {
            if (u.role !== 'admin') roleMenuItems += `<div class="umenu-item" onclick="setUserRole(${u.id},'admin')"><i class="fa-solid fa-shield-halved" style="width:16px;color:var(--accent2)"></i> Promote → Admin</div>`;
            if (u.role !== 'moderator') roleMenuItems += `<div class="umenu-item" onclick="setUserRole(${u.id},'moderator')"><i class="fa-solid fa-bolt" style="width:16px;color:var(--gold)"></i> Set as Moderator</div>`;
            if (u.role !== 'user') roleMenuItems += `<div class="umenu-item" onclick="setUserRole(${u.id},'user')"><i class="fa-solid fa-user" style="width:16px"></i> Demote → User</div>`;
            roleMenuItems = '<div style="border-top:1px solid var(--border2);margin:4px 0"></div>' + roleMenuItems;
        }
        const deleteBtn = isSuperAdmin ? `<div class="umenu-item danger" onclick="deleteUser(${u.id})"><i class="fa-solid fa-trash" style="width:16px"></i> Delete User</div>` : '';
        const actionsHtml = isCurrentUser
            ? '<span style="font-size:11px;color:var(--text3);padding:4px 8px">Current session</span>'
            : `<div style="position:relative;display:inline-block">
                <button class="btn sm ghost" onclick="toggleUserMenu(${u.id}, event)" style="width:32px;height:32px;padding:0;font-size:18px;line-height:1">&#8942;</button>
                <div id="umenu-${u.id}" style="display:none;position:absolute;right:0;top:36px;background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:6px;min-width:215px;z-index:5000;box-shadow:0 12px 40px rgba(0,0,0,0.6)">
                    <div style="padding:8px 14px 4px;font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase">${u.displayName}</div>
                    <div style="border-top:1px solid var(--border2);margin:4px 0"></div>
                    <div class="umenu-item" onclick="viewUserActivity(${u.id})"><i class="fa-solid fa-chart-line" style="width:16px;color:var(--green)"></i> View Activity</div>
                    <div class="umenu-item" onclick="openPermissionsModal(${u.id})"><i class="fa-solid fa-sliders" style="width:16px;color:var(--accent2)"></i> Permissions</div>
                    <div class="umenu-item" onclick="adminResetPass(${u.id})"><i class="fa-solid fa-key" style="width:16px;color:var(--accent)"></i> Reset Password</div>
                    ${roleMenuItems}
                    <div style="border-top:1px solid var(--border2);margin:4px 0"></div>
                    <div class="umenu-item ${u.status === 'banned' ? '' : 'danger'}" onclick="toggleBan(${u.id})"><i class="fa-solid fa-${banIcon}" style="width:16px"></i> ${banLabel}</div>
                    ${deleteBtn}
                </div>
              </div>`;
        const joinDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString('vi-VN') : 'N/A';
        const perms = u.role === 'admin' ? ALL_FEATURES.map(f=>f.id) : (u.permissions || ALL_FEATURES.map(f=>f.id));
        const permsBadge = u.role === 'admin'
            ? '<span style="font-size:11px;color:var(--accent2);font-weight:600">All Access</span>'
            : `<span style="font-size:11px;color:var(--text2)">${perms.length}/${ALL_FEATURES.length}</span>${perms.length < ALL_FEATURES.length ? ' <span style="font-size:10px;color:var(--red)">restricted</span>' : ''}`;
        return `<tr style="border-bottom:1px solid var(--border2);transition:background 0.2s" onmouseenter="this.style.background='rgba(255,255,255,0.02)'" onmouseleave="this.style.background='transparent'">
            <td style="padding:12px">
                <div style="display:flex;align-items:center;gap:8px">
                    <div style="width:34px;height:34px;border-radius:10px;background:${roleColor}18;border:1px solid ${roleColor}33;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:${roleColor}">${u.displayName[0].toUpperCase()}</div>
                    <div>
                        <div style="font-weight:700;color:var(--text)">${u.displayName}${isCurrentUser ? ' <span style="font-size:10px;color:var(--accent)">(you)</span>' : ''}</div>
                        <div style="font-size:11px;color:var(--text3)">@${u.username} · ${joinDate}</div>
                    </div>
                </div>
            </td>
            <td style="padding:12px"><span style="color:${roleColor};font-weight:700;font-size:11px;background:rgba(255,255,255,0.05);padding:3px 9px;border-radius:6px;border:1px solid ${roleColor}">${roleBadge}</span></td>
            <td style="padding:12px"><span style="color:${statusColor};font-size:12px;font-weight:600">● ${u.status}</span></td>
            <td style="padding:12px">
                <div style="display:flex;align-items:center">${onlineDot}<span style="font-size:11px;color:var(--text2)">${isOnline ? '<span style="color:var(--green);font-weight:700">Online</span>' : lastActive}</span></div>
            </td>
            <td style="padding:12px">
                <div style="font-size:12px;color:var(--text3)">Actions: ${u.translations||0}</div>
            </td>
            <td style="padding:12px">${permsBadge}</td>
            <td style="padding:12px;text-align:right"><div style="display:flex;gap:6px;justify-content:flex-end;align-items:center">${actionsHtml}</div></td>
        </tr>`;
    }).join('');
}

function toggleUserMenu(id, e) {
    e.stopPropagation();
    // Remove all existing floating menus
    document.querySelectorAll('.admin-float-menu').forEach(m => m.remove());
    const btn = e.currentTarget;
    const existed = document.getElementById('afm-' + id);
    if (existed) { existed.remove(); return; }
    const source = document.getElementById('umenu-' + id);
    if (!source) return;
    const float = source.cloneNode(true);
    float.id = 'afm-' + id;
    float.className = 'admin-float-menu';
    const rect = btn.getBoundingClientRect();
    const W = 224;
    const left = Math.min(rect.right - W, window.innerWidth - W - 8);
    float.style.cssText = `display:block;position:fixed;left:${Math.max(8,left)}px;top:${rect.bottom+6}px;width:${W}px;background:var(--bg2);border:1px solid rgba(59,130,246,0.3);border-radius:14px;padding:6px;z-index:999999;box-shadow:0 20px 60px rgba(0,0,0,0.8);backdrop-filter:blur(20px)`;
    float.querySelectorAll('[onclick]').forEach(el => {
        const h = el.getAttribute('onclick');
        el.removeAttribute('onclick');
        el.addEventListener('click', ev => { ev.stopPropagation(); document.querySelectorAll('.admin-float-menu').forEach(m=>m.remove()); (new Function(h))(); });
    });
    document.body.appendChild(float);
    // Flip if off-screen bottom
    const fr = float.getBoundingClientRect();
    if (fr.bottom > window.innerHeight - 8) float.style.top = (rect.top - fr.height - 6) + 'px';
}
document.addEventListener('click', () => document.querySelectorAll('.admin-float-menu').forEach(m => m.remove()));
document.addEventListener('scroll', () => document.querySelectorAll('.admin-float-menu').forEach(m => m.remove()), true);

async function setUserRole(id, newRole) {
    document.querySelectorAll('[id^="umenu-"]').forEach(m => m.style.display = 'none');
    const users = await getUsers();
    const u = users.find(x => x.id === id);
    if (!u) return;
    const oldRole = u.role;
    u.role = newRole;
    await saveOneUser(u);
    await logActivity(`Role changed: "${u.username}" ${oldRole} → ${newRole}`, 'admin');
    await renderAdminStats(); await renderAdminUsers();
}

async function viewUserActivity(id) {
    document.querySelectorAll('[id^="umenu-"]').forEach(m => m.style.display = 'none');
    const users = await getUsers();
    const u = users.find(x => x.id === id); if (!u) return;
    const log = await getActivityLog();
    const userLog = log.filter(l => l.user === u.username);

    // Title
    document.getElementById('ua-title').textContent = u.displayName;

    // Meta
    const roleColor = getRoleColor(u.role);
    const joinDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString('vi-VN') : 'N/A';
    document.getElementById('ua-meta').innerHTML = `@${u.username} · Tham gia ${joinDate}`;

    // Stats pills
    const statsEl = document.getElementById('ua-stats');
    const statusColor = u.status === 'active' ? 'var(--green)' : 'var(--red)';
    const statusBg = u.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)';
    const statusBorder = u.status === 'active' ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)';
    statsEl.innerHTML = [
        { label: 'Role', value: getRoleBadge(u.role), color: roleColor, bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)' },
        { label: 'Status', value: u.status === 'active' ? '● Active' : '● Banned', color: statusColor, bg: statusBg, border: statusBorder },
        { label: 'Logins', value: (u.loginCount || 0) + ' lần', color: 'var(--gold)', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
        { label: 'Translations', value: (u.translations || 0) + ' lượt', color: 'var(--accent2)', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.2)' },
        { label: 'Activities', value: userLog.length + ' sự kiện', color: 'var(--accent3)', bg: 'rgba(6,182,212,0.08)', border: 'rgba(6,182,212,0.2)' },
    ].map(s => `
        <div style="flex-shrink:0;background:${s.bg};border:1px solid ${s.border};border-radius:10px;padding:8px 14px;text-align:center;min-width:100px">
            <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;font-weight:700">${s.label}</div>
            <div style="font-size:14px;font-weight:800;color:${s.color}">${s.value}</div>
        </div>`).join('');

    // Activity count
    const countEl = document.getElementById('ua-count');
    if (countEl) countEl.textContent = userLog.length + ' sự kiện được ghi nhận';

    // Activity log
    const typeColor = { login: 'var(--green)', logout: 'var(--text2)', register: 'var(--accent)', admin: 'var(--accent2)', info: 'var(--text3)' };
    const typeIcon = { login: 'fa-right-to-bracket', logout: 'fa-right-from-bracket', register: 'fa-user-plus', admin: 'fa-shield-halved', info: 'fa-circle-info' };
    document.getElementById('ua-log').innerHTML = userLog.length ? userLog.map(l =>
        `<div style="display:flex;gap:12px;align-items:center;padding:10px 14px;background:rgba(255,255,255,0.02);border-radius:10px;border:1px solid var(--border2);transition:background 0.15s" onmouseenter="this.style.background='rgba(255,255,255,0.04)'" onmouseleave="this.style.background='rgba(255,255,255,0.02)'">
            <div style="width:30px;height:30px;border-radius:8px;background:${typeColor[l.type]||'var(--text3)'}22;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <i class="fa-solid ${typeIcon[l.type]||'fa-circle'}" style="font-size:12px;color:${typeColor[l.type]||'var(--text3)'}"></i>
            </div>
            <div style="flex:1;font-size:13px;color:var(--text)">${l.msg}</div>
            <div style="font-size:11px;color:var(--text3);white-space:nowrap;font-family:'JetBrains Mono',monospace">${l.time}</div>
        </div>`).join('')
        : `<div style="text-align:center;padding:40px;color:var(--text3)">
            <i class="fa-solid fa-clock" style="font-size:28px;margin-bottom:10px;opacity:0.4;display:block"></i>
            Chưa có hoạt động nào được ghi nhận.
           </div>`;

    document.getElementById('user-activity-modal').style.display = 'flex';
}

async function adminResetPass(id) {
    document.querySelectorAll('[id^="umenu-"]').forEach(m => m.style.display = 'none');
    const newPass = prompt('Enter new password for this user (min 6 characters):');
    if (!newPass) return;
    if (newPass.length < 6) return alert('Password must be at least 6 characters.');
    const users = await getUsers();
    const u = users.find(x => x.id === id); if (!u) return;
    u.password = btoa(newPass);
    await saveOneUser(u);
    await logActivity(`Admin reset password for "${u.username}"`, 'admin');
    alert(`Password for "${u.username}" has been reset!`);
    await renderAdminUsers();
}

async function toggleBan(id) {
    const users = await getUsers();
    const u = users.find(x => x.id === id); if (!u) return;
    u.status = u.status === 'banned' ? 'active' : 'banned';
    await saveOneUser(u);
    await logActivity(`User "${u.username}" ${u.status === 'banned' ? 'banned' : 'unbanned'}`, 'admin');
    await renderAdminStats(); await renderAdminUsers();
}

async function deleteUser(id) {
    if (!confirm('Delete this user permanently?')) return;
    const users = await getUsers();
    const u = users.find(x => x.id === id);
    await fbRemove(`users/${id}`);
    await logActivity(`User "${u?.username}" deleted`, 'admin');
    await renderAdminStats(); await renderAdminUsers();
}

function openAddUserModal() { document.getElementById('add-user-modal').style.display = 'flex'; }

async function doAddUser() {
    const username = document.getElementById('add-username').value.trim();
    const display = document.getElementById('add-display').value.trim();
    const pass = document.getElementById('add-pass').value;
    const role = document.getElementById('add-role').value;
    if (!username || !display || !pass) return alert('Please fill in all fields.');
    const users = await getUsers();
    if (users.find(u => u.username === username)) return alert('Username already exists.');
    const newUser = {
        id: Date.now(), username, password: btoa(pass), displayName: display,
        role, status: 'active', createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(), translations: 0, loginCount: 0,
        permissions: getDefaultPermissions(role)
    };
    await saveOneUser(newUser);
    await logActivity(`Admin created user "${username}" (${role})`, 'admin');
    document.getElementById('add-user-modal').style.display = 'none';
    ['add-username','add-display','add-pass'].forEach(id => document.getElementById(id).value = '');
    await renderAdminStats(); await renderAdminUsers();
    alert(`✓ User "${username}" created successfully!`);
}

async function renderActivityLog() {
    const log = await getActivityLog();
    const el = document.getElementById('activity-log');
    if (!el) return;
    const typeFilter = document.getElementById('log-type-filter')?.value || '';
    const searchQ = (document.getElementById('log-search')?.value || '').toLowerCase();
    let filtered = log;
    if (typeFilter) filtered = filtered.filter(l => l.type === typeFilter);
    if (searchQ) filtered = filtered.filter(l => l.msg.toLowerCase().includes(searchQ) || (l.user||'').toLowerCase().includes(searchQ));

    if (!filtered.length) { el.innerHTML = '<div style="color:var(--text3);font-size:13px;text-align:center;padding:24px">No matching activity.</div>'; return; }
    const typeColor = { login: 'var(--green)', logout: 'var(--text2)', register: 'var(--accent)', admin: 'var(--accent2)', info: 'var(--text3)' };
    const typeIcon  = { login: 'fa-right-to-bracket', logout: 'fa-right-from-bracket', register: 'fa-user-plus', admin: 'fa-shield-halved', info: 'fa-circle-info' };
    const typeLabel = { login: 'LOGIN', logout: 'LOGOUT', register: 'REGISTER', admin: 'ADMIN', info: 'INFO' };
    el.innerHTML = filtered.slice(0, 200).map(l => `
        <div style="display:flex;gap:10px;align-items:center;padding:10px 14px;background:rgba(255,255,255,0.02);border-radius:10px;border:1px solid var(--border2);transition:background 0.15s" onmouseenter="this.style.background='rgba(255,255,255,0.04)'" onmouseleave="this.style.background='rgba(255,255,255,0.02)'">
            <div style="width:32px;height:32px;border-radius:9px;background:${typeColor[l.type]||'var(--text3)'}18;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <i class="fa-solid ${typeIcon[l.type]||'fa-circle'}" style="font-size:12px;color:${typeColor[l.type]||'var(--text3)'}"></i>
            </div>
            <div style="flex:1">
                <div style="font-size:13px;color:var(--text)">${l.msg}</div>
                <div style="display:flex;align-items:center;gap:8px;margin-top:3px">
                    <span style="font-size:10px;font-weight:700;color:${typeColor[l.type]||'var(--text3)'};background:${typeColor[l.type]||'var(--text3)'}18;padding:2px 7px;border-radius:5px">${typeLabel[l.type]||'EVENT'}</span>
                    ${l.user ? `<span style="font-size:10px;color:var(--text3)">by @${l.user}</span>` : ''}
                </div>
            </div>
            <div style="font-size:10px;color:var(--text3);white-space:nowrap;font-family:'JetBrains Mono',monospace;text-align:right">${l.time}</div>
        </div>`).join('');
}

// ─── PERMISSIONS MODAL ───
async function openPermissionsModal(userId) {
    document.querySelectorAll('[id^="umenu-"]').forEach(m => m.style.display = 'none');
    const users = await getUsers();
    const u = users.find(x => x.id === userId); if (!u) return;
    if (!u.permissions) u.permissions = getDefaultPermissions(u.role);
    document.getElementById('perm-modal-title').textContent = 'Permissions: ' + u.displayName;
    document.getElementById('perm-modal-sub').textContent = '@' + u.username + ' · ' + getRoleBadge(u.role);
    document.getElementById('perm-user-id').value = userId;
    document.getElementById('perm-list').innerHTML = ALL_FEATURES.map(f => `
        <label style="display:flex;align-items:center;gap:14px;padding:12px 16px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid var(--border2);cursor:pointer" onmouseenter="this.style.background='rgba(59,130,246,0.06)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)'">
            <input type="checkbox" id="perm-${f.id}" ${u.permissions.indexOf(f.id)>=0?'checked':''} style="width:18px;height:18px;accent-color:var(--accent);cursor:pointer">
            <div style="flex:1">
                <div style="font-weight:700;font-size:14px;display:flex;align-items:center;gap:8px"><i class="fa-solid ${f.icon}" style="color:var(--accent);width:14px"></i>${f.label}</div>
                <div style="font-size:12px;color:var(--text3);margin-top:2px">${f.desc}</div>
            </div>
        </label>`).join('');
    document.getElementById('perm-modal').style.display = 'flex';
}

async function savePermissions() {
    const userId = parseInt(document.getElementById('perm-user-id').value);
    const users = await getUsers();
    const u = users.find(x => x.id === userId); if (!u) return;
    u.permissions = ALL_FEATURES.filter(f => document.getElementById('perm-'+f.id)?.checked).map(f => f.id);
    await saveOneUser(u);
    await logActivity(`Permissions updated for "${u.username}": [${u.permissions.join(', ')}]`, 'admin');
    document.getElementById('perm-modal').style.display = 'none';
    await renderAdminUsers();
    alert('Permissions saved for ' + u.displayName + '!');
}

async function grantAllPermissions(userId) {
    const users = await getUsers();
    const u = users.find(x => x.id === userId); if (!u) return;
    u.permissions = ALL_FEATURES.map(f => f.id);
    await saveOneUser(u);
    await logActivity(`All permissions granted to "${u.username}"`, 'admin');
    await renderAdminUsers();
}

// ─── CHANGE PASSWORD ───
function openChangePassModal() {
    const user = getCurrentUser(); if (!user) return;
    document.getElementById('change-pass-user-label').textContent = `Changing password for: ${user.displayName} (${user.username})`;
    ['cp-current','cp-new','cp-confirm'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('cp-error').style.display = 'none';
    document.getElementById('change-pass-modal').style.display = 'flex';
}

async function doChangePass() {
    const user = getCurrentUser(); if (!user) return;
    const current = document.getElementById('cp-current').value;
    const newPass = document.getElementById('cp-new').value;
    const confirm = document.getElementById('cp-confirm').value;
    const errEl = document.getElementById('cp-error');
    errEl.style.display = 'none';
    if (!current || !newPass || !confirm) { errEl.textContent = 'Please fill in all fields.'; errEl.style.display = 'block'; return; }
    const users = await getUsers();
    const u = users.find(x => x.id === user.id); if (!u) return;
    if (u.password !== btoa(current)) { errEl.textContent = 'Current password is incorrect.'; errEl.style.display = 'block'; return; }
    if (newPass.length < 6) { errEl.textContent = 'New password must be at least 6 characters.'; errEl.style.display = 'block'; return; }
    if (newPass !== confirm) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }
    u.password = btoa(newPass);
    await saveOneUser(u);
    setCurrentUser(u);
    await logActivity(`User "${u.username}" changed their password`, 'info');
    document.getElementById('change-pass-modal').style.display = 'none';
    alert('Password changed successfully!');
}

// ─── INIT ───
(async function initAuth() {
    const user = getCurrentUser();
    if (user) {
        document.getElementById('auth-overlay').style.display = 'none';
        onLoginSuccess(user);
    }
})();

window.addEventListener('resize', initCanvas);
initCanvas(); drawCanvas();
localStorage.removeItem('ass_api_key');
checkStreak(); updateHomeStats(); renderFiles();
// Auto ping proxy to verify server is alive
(async () => {
    try {
        const r = await fetch(getProxyBase() + '/api/health');
        const d = await r.json();
        updateStatus(d.hasKey === true);
    } catch(e) { updateStatus(false); }
})();