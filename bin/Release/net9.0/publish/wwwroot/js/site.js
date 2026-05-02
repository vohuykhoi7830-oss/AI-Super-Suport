// ═══════════════════════════════════════════
//  AI SUPPER SUPPORT — CORE ENGINE
// ═══════════════════════════════════════════

// State
const S = {
    words: JSON.parse(localStorage.getItem('ass_words') || '[]'),
    files: JSON.parse(localStorage.getItem('ass_files') || '[]'),
    docText: "",
    streak: parseInt(localStorage.getItem('ass_streak') || '0'),
    lastVisit: localStorage.getItem('ass_last_visit'),
    dailyCount: parseInt(sessionStorage.getItem('ass_daily') || '0'),
    apiKey: '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',
    skillLevel: 'Easy',
    skillSrc: 'ai',
    selectedSkill: null,
    quizData: [], quizAnswers: [], quizIndex: 0
};

function save() {
    localStorage.setItem('ass_words', JSON.stringify(S.words));
    localStorage.setItem('ass_files', JSON.stringify(S.files));
}

// ─── API ENGINE — GROQ (llama-3.3-70b) ───
async function callAI(prompt, system = '') {
    const key = S.apiKey;
    if (!key) { showModal(); return '⚠️ Please enter your Groq API Key to continue.'; }
    try {
        const messages = [];
        if (system) messages.push({ role: 'system', content: system });
        messages.push({ role: 'user', content: prompt });

        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                max_tokens: 1500,
                messages
            })
        });
        const d = await r.json();
        if (d.choices && d.choices[0]) return d.choices[0].message.content.replace(/```[\w]*\n?/g,'').replace(/```/g,'').trim();
        if (d.error) {
            if (d.error.code === 'invalid_api_key' || d.error.status === 401) {
                updateStatus(false);
                return '❌ Invalid API Key. Please check at console.groq.com';
            }
            return `Lỗi API: ${d.error.message}`;
        }
        return 'AI không trả về kết quả.';
    } catch (e) {
        return `Lỗi kết nối: ${e.message}`;
    }
}

// ─── MODAL ───
function showModal() { document.getElementById('api-modal').classList.remove('hidden'); }
function closeModal() { document.getElementById('api-modal').classList.add('hidden'); }
async function saveApiKey() {
    const k = document.getElementById('api-key-input').value.trim();
    if (!k) return alert('Please enter your API Key!');
    if (!k.startsWith('gsk_')) return alert('Groq API Key phải bắt đầu bằng gsk_...\nLấy key tại: console.groq.com/keys');

    const btn = document.querySelector('#api-modal .btn:not(.ghost)');
    btn.innerHTML = '<span class="spinner"></span> Đang kiểm tra...';
    btn.disabled = true;

    try {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${k}` },
            body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] })
        });
        const d = await r.json();
        if (d.error) {
            btn.innerHTML = '<i class="fa-solid fa-key"></i> Save & Connect';
            btn.disabled = false;
            return alert('❌ Invalid API Key!\nPlease check at console.groq.com/keys');
        }
    } catch(e) { /* network error, vẫn lưu nếu format đúng */ }

    S.apiKey = k;
    localStorage.setItem('ass_api_key', k);
    btn.innerHTML = '<i class="fa-solid fa-key"></i> Save & Connect';
    btn.disabled = false;
    closeModal();
    updateStatus(true);
}
function updateStatus(on) {
    const user = getCurrentUser();
    document.querySelectorAll('.ai-badge').forEach(b => {
        if (user) {
            const aiStatus = on ? ' · AI Online' : '';
            b.innerHTML = `✦ ${user.displayName} <span style="opacity:0.6;font-size:10px">(${user.role}${aiStatus})</span>`;
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
            'You are a professional translator. Translate accurately and naturally. Keep format concise.'
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

function speakResult() {
    const t = document.getElementById('trans-result').textContent;
    if (!t || t.includes('Kết quả')) return;
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'en-US'; speechSynthesis.speak(u);
}
function copyResult() {
    const t = document.getElementById('trans-result').textContent;
    navigator.clipboard.writeText(t).then(() => alert('Copied!'));
}
function saveToVocab() {
    const w = document.getElementById('trans-input').value.trim();
    const m = document.getElementById('trans-result').textContent.split('\n')[0].trim();
    if (!w || !m || m.includes('Kết quả')) return alert('No content to save yet!');
    S.words.unshift({ id: Date.now(), word: w, meaning: m, example: '' });
    save(); updateHomeStats();
    alert('Saved to vocabulary!');
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
    `).join('') : `<div style="grid-column:1/-1;text-align:center;color:var(--text3);padding:40px">Library is empty. Add some vocabulary!</div>`;
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
    const res = await callAI(`Phân tích từ "${word}": phát âm IPA, loại từ, nghĩa đầy đủ, 2 ví dụ câu hay, từ đồng nghĩa/trái nghĩa. Ngắn gọn súc tích.`);
    box.textContent = res;
}

async function aiGenerateVocab() {
    const topic = prompt('Enter a topic to generate vocabulary (e.g. Business, Environment, Technology):');
    if (!topic) return;
    const res = await callAI(
        `Generate 8 từ vựng tiếng Anh chủ đề "${topic}" trình độ B2-C1. Mỗi từ: từ vựng | nghĩa tiếng Việt | ví dụ câu. Dùng dấu | phân cách, mỗi từ một dòng.`,
        'Chỉ trả về danh sách theo định dạng yêu cầu, không có gì khác.'
    );
    const lines = res.split('\n').filter(l => l.includes('|'));
    lines.forEach(line => {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length >= 2) S.words.unshift({ id: Date.now() + Math.random(), word: parts[0], meaning: parts[1], example: parts[2] || '' });
    });
    save(); renderVocab();
    alert(`Added ${lines.length} new words!`);
}

// ─── 3. FILES ───
async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const out = document.getElementById('solver-view');
    out.classList.remove('hidden');
    out.innerHTML = '<span class="spinner"></span> Reading file...';

    let text = '';
    try {
        if (file.name.endsWith('.docx')) {
            const res = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
            text = res.value;
        } else if (file.name.endsWith('.pdf')) {
            const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise;
            for (let i = 1; i <= Math.min(pdf.numPages, 8); i++) {
                const pg = await pdf.getPage(i);
                const tc = await pg.getTextContent();
                text += tc.items.map(t => t.str).join(' ') + '\n';
            }
        } else {
            text = await file.text();
        }
    } catch (err) { out.textContent = 'Cannot read file: ' + err.message; return; }

    S.docText = text;
    const existing = S.files.find(f => f.name === file.name);
    if (!existing) {
        S.files.push({ id: Date.now(), name: file.name, content: text, date: new Date().toLocaleDateString('vi-VN') });
        save();
    }
    renderFiles();

    out.innerHTML = '<span class="spinner"></span> AI đang phân tích và giải bài...';
    const res = await callAI(
        `Analyze the following document and perform:\n1. Summarize the main content\n2. Solve each exercise/question in detail (if any)\n3. Explain difficult vocabulary\n4. Note important grammar points\n\nDocument:\n${text.slice(0, 3500)}`,
        'You are a professional English tutor. Explain clearly. For Vietnamese users, provide Vietnamese explanations alongside English.'
    );
    out.textContent = res;
}

function renderFiles() {
    const box = document.getElementById('file-list');
    const badge = document.getElementById('file-count-badge');
    if (badge) badge.textContent = `${S.files.length} file`;
    S.files.sort((a,b) => a.name.localeCompare(b.name));
    box.innerHTML = S.files.length ? S.files.map(f => `
        <div class="file-item" onclick="loadDocFile(${f.id})">
            <div>
                <div class="file-name"><i class="fa-solid fa-file-lines" style="color:var(--accent2);margin-right:6px"></i>${f.name}</div>
                <div class="file-meta">${f.date || ''} · ${(f.content.length/1000).toFixed(1)}K ký tự</div>
            </div>
            <button class="btn icon danger sm" onclick="event.stopPropagation();deleteFile(${f.id})"><i class="fa-solid fa-trash"></i></button>
        </div>
    `).join('') : '<p style="text-align:center;color:var(--text3);padding:30px">Chưa có file nào.</p>';
    updateHomeStats();
}

function loadDocFile(id) {
    const f = S.files.find(x => x.id === id);
    if (!f) return;
    S.docText = f.content;
    alert(`✓ "${f.name}" loaded into AI memory!`);
}
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

// ─── 4. 4 SKILLS ───
let currentSkill = null;
function selectSkill(s) {
    currentSkill = s;
    document.querySelectorAll('.skill-hero').forEach(c => c.style.outline = '');
    event.currentTarget.style.outline = '2px solid var(--accent)';
    document.getElementById('run-skill-btn').innerHTML = `<i class="fa-solid fa-play"></i> Practice ${s}`;
}
function setLevel(l, btn) {
    S.skillLevel = l;
    document.querySelectorAll('.lvl-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}
function setSkillSrc(s, btn) {
    S.skillSrc = s;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

async function runSkill() {
    if (!currentSkill) return alert('Please select a skill first!');
    const res = document.getElementById('skill-result');
    const writingArea = document.getElementById('writing-area');
    res.style.display = 'block';
    res.className = 'skill-result loading';
    res.innerHTML = '<span class="spinner"></span> AI Coach is creating your exercise...';

    let context = '';
    if (S.skillSrc === 'doc' && S.docText) context = `Based on this document: ${S.docText.slice(0, 1200)}`;
    else if (S.skillSrc === 'vocab' && S.words.length) context = `Using these words: ${S.words.slice(0,15).map(w=>w.word).join(', ')}`;
    else context = 'Random interesting IELTS/TOEIC academic topic';

    const prompts = {
        Listening: `Create a ${S.skillLevel} Listening exercise for IELTS/TOEIC. ${context}. Include: a short audio script (as if heard), 4 multiple-choice questions with answers and explanations. Format clearly in English.`,
        Speaking: `Create a ${S.skillLevel} Speaking exercise. ${context}. Include: 1 interesting topic, 5-6 key talking points, 8-10 useful vocabulary with IPA pronunciation, 2-3 useful sentence structures, pronunciation tips. All in English.`,
        Reading: `Create a ${S.skillLevel} Reading exercise. ${context}. Include: a 150-200 word passage, 5 comprehension questions (multiple choice), detailed answers and explanations, key vocabulary. All in English.`,
        Writing: `Create a ${S.skillLevel} Writing prompt. ${context}. Include: a clear task, a 4-paragraph outline guide, 8-10 useful linking words, sample opening sentences. All in English.`
    };

    const r = await callAI(prompts[currentSkill], `You are a professional IELTS/TOEIC Coach. Create high-quality, clear, well-structured exercises.`);
    res.className = 'skill-result';
    res.textContent = r;

    if (currentSkill === 'Writing') {
        writingArea.classList.remove('hidden');
    } else {
        writingArea.classList.add('hidden');
    }
}

async function submitWriting() {
    const text = document.getElementById('writing-submission').value.trim();
    if (!text) return alert('Hãy viết bài trước!');
    const fb = document.getElementById('writing-feedback');
    fb.classList.remove('hidden');
    fb.innerHTML = '<span class="spinner"></span> AI đang chấm bài...';
    const r = await callAI(
        `Grade this English writing based on IELTS criteria:\n1. Task Achievement\n2. Coherence & Cohesion\n3. Lexical Resource\n4. Grammatical Range\n\nPoint out specific errors and suggest corrections. Give a Band score 1-9.\n\nWriting:\n${text}`,
        'You are a professional IELTS examiner. Give objective, detailed, constructive feedback in English.'
    );
    fb.textContent = r;
}

// ─── 5. QUIZ ───
let quizState = { questions: [], current: 0, score: 0, answered: [] };

async function generateQuiz() {
    const src = document.getElementById('q-src').value;
    const lvl = document.getElementById('q-lvl').value;
    const cnt = document.getElementById('q-count').value;
    const container = document.getElementById('quiz-container');
    container.innerHTML = `<div class="card" style="text-align:center;padding:40px"><span class="spinner"></span><div style="margin-top:12px;color:var(--text2)">AI is generating ${cnt} questions...</div></div>`;

    let data = src === 'vocab' ? JSON.stringify(S.words.slice(0,20)) : (src === 'doc' ? S.docText.slice(0,2000) : 'Random IELTS/TOEIC academic topic');

    const r = await callAI(
        `Create ${cnt} English multiple-choice questions at ${lvl} level. Based on: ${data.slice(0,1800)}.\n\nReturn a JSON array, each item:\n{"q": "question", "opts": ["A. ...", "B. ...", "C. ...", "D. ..."], "ans": 0, "explain": "short explanation"}\n\nans is the index of the correct answer (0-3). Return only valid JSON, nothing else.`,
        'Return only a valid JSON array. No markdown, no extra text.'
    );

    try {
        const clean = r.replace(/```json|```/g,'').trim();
        quizState.questions = JSON.parse(clean);
        quizState.current = 0; quizState.score = 0; quizState.answered = [];
        document.getElementById('score-display').textContent = '0%';
        document.getElementById('score-detail').textContent = '';
        document.getElementById('quiz-progress').style.display = 'block';
        renderQuestion();
    } catch(e) {
        container.innerHTML = `<div class="card"><div class="result-box">${r}</div></div>`;
    }
}

function renderQuestion() {
    const { questions, current } = quizState;
    if (current >= questions.length) return showFinalScore();
    const q = questions[current];
    const total = questions.length;

    document.getElementById('prog-txt').textContent = `${current+1}/${total}`;
    document.getElementById('prog-bar').style.width = `${((current)/total)*100}%`;

    const container = document.getElementById('quiz-container');
    container.innerHTML = `
        <div class="card">
            <div class="quiz-num">Câu ${current+1} / ${total} · ${document.getElementById('q-lvl').value}</div>
            <div class="quiz-question">${q.q}</div>
            <div class="quiz-options">
                ${q.opts.map((opt,i) => `<button class="quiz-opt" onclick="answerQuiz(${i})">${opt}</button>`).join('')}
            </div>
            <div id="answer-reveal" class="answer-reveal"></div>
        </div>
    `;
}

function answerQuiz(idx) {
    const q = quizState.questions[quizState.current];
    const opts = document.querySelectorAll('.quiz-opt');
    opts.forEach((btn, i) => {
        btn.disabled = true;
        if (i === q.ans) btn.classList.add('correct');
        else if (i === idx && i !== q.ans) btn.classList.add('wrong');
    });

    if (idx === q.ans) quizState.score++;

    const reveal = document.getElementById('answer-reveal');
    reveal.classList.add('show');
    var answerText = idx === q.ans ? '\u2713 Correct!' : ('\u2717 Wrong. Answer: ' + q.opts[q.ans]);
    reveal.innerHTML = '<strong>' + answerText + '</strong><br><br>' + q.explain;

    const pct = Math.round((quizState.score / (quizState.current + 1)) * 100);
    document.getElementById('score-display').textContent = pct + '%';
    document.getElementById('score-detail').textContent = quizState.score + '/' + (quizState.current + 1) + ' correct';

    quizState.current++;
    setTimeout(renderQuestion, 2000);
}

function showFinalScore() {
    const { score, questions } = quizState;
    const pct = Math.round((score / questions.length) * 100);
    document.getElementById('prog-bar').style.width = '100%';
    document.getElementById('score-display').textContent = pct + '%';
    document.getElementById('score-detail').textContent = '\u2713 Completed! ' + score + '/' + questions.length + ' correct';
    var trophy = pct >= 80 ? '🏆' : (pct >= 60 ? '🎯' : '📚');
    var endMsg = pct >= 80 ? 'Excellent! You truly mastered this!' : (pct >= 60 ? 'Good! Keep practicing!' : "Keep going! Don't give up!");
    document.getElementById('quiz-container').innerHTML =
        '<div class="card" style="text-align:center;padding:40px">'
        + '<div style="font-size:60px;margin-bottom:16px">' + trophy + '</div>'
        + '<div style="font-family:\'Syne\',sans-serif;font-size:48px;font-weight:900;color:var(--accent)">' + pct + '%</div>'
        + '<div style="color:var(--text2);margin:12px 0">' + score + '/' + questions.length + ' correct</div>'
        + '<div style="font-size:14px;color:var(--text3);margin-bottom:24px">' + endMsg + '</div>'
        + '<button class="btn" onclick="generateQuiz()"><i class="fa-solid fa-rotate"></i> Retry</button>'
        + '</div>';
}

// ─── 6. AI CHAT ───
const chatHistory = [];
async function sendChat() {
    const inp = document.getElementById('chat-input');
    const msg = inp.value.trim();
    if (!msg) return;
    inp.value = '';
    appendMsg('user', msg);
    chatHistory.push({ role: 'user', content: msg });

    const thinkId = appendThinking();
    const r = await callAI(
        msg,
        `You are AI Supper Support — a comprehensive English learning assistant. Answer clearly with real examples. Use both English and Vietnamese when helpful for learners in Vietnam.`
    );
    removeThinking(thinkId);
    appendMsg('ai', r);
    chatHistory.push({ role: 'assistant', content: r });
}

function quickChat(msg) {
    document.getElementById('chat-input').value = msg;
    sendChat();
}

function appendMsg(role, text) {
    const box = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    var avatarInner = role === 'ai' ? 'ASS' : '<i class="fa-solid fa-user"></i>';
    div.innerHTML = '<div class="avatar ' + role + '">' + avatarInner + '</div>'
        + '<div class="bubble ' + role + '">' + text + '</div>';
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return div.id = 'msg-' + Date.now();
}

function appendThinking() {
    const id = 'think-' + Date.now();
    const box = document.getElementById('chat-messages');
    box.innerHTML += `<div class="msg" id="${id}"><div class="avatar ai">ASS</div><div class="bubble ai thinking"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>`;
    box.scrollTop = box.scrollHeight;
    return id;
}
function removeThinking(id) { document.getElementById(id)?.remove(); }

function toggleMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert('Your browser does not support microphone.');
    const rec = new SR(); rec.lang = 'en-US'; rec.start();
    document.getElementById('mic-btn').style.background = 'rgba(239,68,68,0.2)';
    document.getElementById('mic-btn').style.color = 'var(--red)';
    rec.onresult = e => {
        document.getElementById('chat-input').value = e.results[0][0].transcript;
        document.getElementById('mic-btn').style.background = '';
        document.getElementById('mic-btn').style.color = '';
    };
    rec.onerror = () => { document.getElementById('mic-btn').style.background = ''; document.getElementById('mic-btn').style.color = ''; };
}

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
let pts = [], lines = [];
function initCanvas() {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    pts = Array.from({length:55}, () => ({
        x: Math.random()*canvas.width, y: Math.random()*canvas.height,
        vx: (Math.random()-0.5)*0.4, vy: (Math.random()-0.5)*0.4,
        r: Math.random()*1.5+0.5
    }));
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
    for(let i=0;i<pts.length;i++) {
        for(let j=i+1;j<pts.length;j++) {
            const dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y;
            const dist=Math.sqrt(dx*dx+dy*dy);
            if(dist<140) {
                ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y);
                ctx.strokeStyle=`rgba(59,130,246,${0.12*(1-dist/140)})`; ctx.lineWidth=0.8; ctx.stroke();
            }
        }
    }
    requestAnimationFrame(drawCanvas);
}



// ═══════════════════════════════════════════
//  PERMISSION SYSTEM
// ═══════════════════════════════════════════

var ALL_FEATURES = [
    { id: 'translate',  label: 'AI Translator',       icon: 'fa-language',       desc: 'Dịch thuật tự động AI' },
    { id: 'vocab',      label: 'Vocabulary Bank',      icon: 'fa-layer-group',    desc: 'Quản lý từ vựng cá nhân' },
    { id: 'files',      label: 'File & AI Solver',     icon: 'fa-folder-open',   desc: 'Upload & AI giải bài tập' },
    { id: 'skills',     label: '4 Skills Lab',          icon: 'fa-dumbbell',      desc: 'Luyện 4 kỹ năng IELTS/TOEIC' },
    { id: 'quiz',       label: 'AI Quiz Lab',           icon: 'fa-graduation-cap', desc: 'Kiểm tra trắc nghiệm AI' },
    { id: 'chat',       label: 'AI Research Coach',    icon: 'fa-brain',          desc: 'Chat hỏi đáp AI' }
];

function getDefaultPermissions(role) {
    // Admin & moderator: all features. User: all by default (admin can restrict)
    var all = ALL_FEATURES.map(function(f){ return f.id; });
    return all;
}

function getUserPermissions(user) {
    if (!user) return [];
    if (user.role === 'admin') return ALL_FEATURES.map(function(f){ return f.id; });
    if (!user.permissions) return getDefaultPermissions(user.role);
    return user.permissions;
}

function hasPermission(featureId) {
    var user = getCurrentUser();
    if (!user) return false;
    if (user.role === 'admin') return true;
    return getUserPermissions(user).indexOf(featureId) >= 0;
}

function applyPermissions(user) {
    var perms = getUserPermissions(user);
    ALL_FEATURES.forEach(function(f) {
        var allowed = user.role === 'admin' || perms.indexOf(f.id) >= 0;
        // Hide nav buttons for locked features
        var navBtns = document.querySelectorAll('[onclick*="goTo(\''+f.id+'\')"]');
        navBtns.forEach(function(btn){
            btn.style.opacity = allowed ? '1' : '0.3';
            btn.title = allowed ? '' : 'Locked by admin';
            if (!allowed) btn.onclick = function(){ alert('Feature locked. Contact admin.'); };
        });
    });
}

// Open permissions editor modal
function openPermissionsModal(userId) {
    document.querySelectorAll('[id^="umenu-"]').forEach(function(m){ m.style.display = 'none'; });
    var users = getUsers();
    var u = users.find(function(x){ return x.id === userId; });
    if (!u) return;
    
    if (!u.permissions) u.permissions = getDefaultPermissions(u.role);
    
    document.getElementById('perm-modal-title').textContent = 'Permissions: ' + u.displayName;
    document.getElementById('perm-modal-sub').textContent = '&#64;' + u.username + ' · ' + getRoleBadge(u.role);
    document.getElementById('perm-user-id').value = userId;
    
    var html = ALL_FEATURES.map(function(f) {
        var checked = u.permissions.indexOf(f.id) >= 0;
        var checkedAttr = checked ? 'checked' : '';
        return '<label style="display:flex;align-items:center;gap:14px;padding:12px 16px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid var(--border2);cursor:pointer;transition:background 0.2s" onmouseenter="this.style.background=\'rgba(59,130,246,0.06)\'" onmouseleave="this.style.background=\'rgba(255,255,255,0.03)\'">'
            + '<input type="checkbox" id="perm-' + f.id + '" ' + checkedAttr + ' style="width:18px;height:18px;accent-color:var(--accent);cursor:pointer">'
            + '<div style="flex:1">'
                + '<div style="font-weight:700;font-size:14px;display:flex;align-items:center;gap:8px"><i class="fa-solid ' + f.icon + '" style="color:var(--accent);width:14px"></i>' + f.label + '</div>'
                + '<div style="font-size:12px;color:var(--text3);margin-top:2px">' + f.desc + '</div>'
            + '</div>'
            + '</label>';
    }).join('');
    
    document.getElementById('perm-list').innerHTML = html;
    document.getElementById('perm-modal').style.display = 'flex';
}

function savePermissions() {
    var userId = parseInt(document.getElementById('perm-user-id').value);
    var users = getUsers();
    var u = users.find(function(x){ return x.id === userId; });
    if (!u) return;
    
    var newPerms = ALL_FEATURES.filter(function(f){
        var cb = document.getElementById('perm-' + f.id);
        return cb && cb.checked;
    }).map(function(f){ return f.id; });
    
    u.permissions = newPerms;
    saveUsers(users);
    logActivitySafe('Permissions updated for "' + u.username + '": [' + newPerms.join(', ') + ']', 'admin');
    document.getElementById('perm-modal').style.display = 'none';
    renderAdminUsers();
    alert('Permissions saved for ' + u.displayName + '!');
}

function grantAllPermissions(userId) {
    var users = getUsers();
    var u = users.find(function(x){ return x.id === userId; });
    if (!u) return;
    u.permissions = ALL_FEATURES.map(function(f){ return f.id; });
    saveUsers(users);
    logActivitySafe('All permissions granted to "' + u.username + '"', 'admin');
    renderAdminUsers();
}

// ═══════════════════════════════════════════
//  AUTH & ADMIN SYSTEM
// ═══════════════════════════════════════════

// Default admin account (stored in localStorage as "database")
function getUsers() {
    const stored = localStorage.getItem('ass_users');
    if (stored) return JSON.parse(stored);
    // Default admin account
    const defaults = [
        { id: 1, username: 'admin', password: btoa('admin123'), displayName: 'Administrator', role: 'admin', status: 'active', createdAt: new Date().toISOString(), lastActive: new Date().toISOString(), translations: 0, loginCount: 0 }
    ];
    localStorage.setItem('ass_users', JSON.stringify(defaults));
    return defaults;
}

function saveUsers(users) {
    localStorage.setItem('ass_users', JSON.stringify(users));
}

function getActivityLog() {
    return JSON.parse(localStorage.getItem('ass_activity') || '[]');
}

function logActivity(msg, type) {
    if (type === undefined) type = 'info';
    try { logActivitySafe(msg, type); } catch(e) { console.warn('logActivity error:', e); }
}
function logActivitySafe(msg, type) {
    if (type === undefined) type = 'info';
    var log = getActivityLog();
    var cu = getCurrentUser();
    log.unshift({ msg: msg, type: type, time: new Date().toLocaleString(), user: cu ? cu.username : 'system' });
    if (log.length > 200) log.pop();
    localStorage.setItem('ass_activity', JSON.stringify(log));
}

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
    el.textContent = msg;
    el.style.display = 'block';
}

function doLogin() {
    try {
        const username = document.getElementById('auth-username').value.trim();
        const password = document.getElementById('auth-password').value;
        if (!username || !password) return showAuthError('Please fill in all fields.');
        const users = getUsers();
        const user = users.find(u => u.username === username && u.password === btoa(password));
        if (!user) return showAuthError('Invalid username or password.');
        if (user.status === 'banned') return showAuthError('Your account has been suspended. Contact admin.');
        user.lastActive = new Date().toISOString();
        user.loginCount = (user.loginCount || 0) + 1;
        // Ensure permissions field exists
        if (!user.permissions) user.permissions = getDefaultPermissions(user.role);
        saveUsers(users);
        setCurrentUser(user);
        logActivitySafe('User "' + user.username + '" signed in', 'login');
        document.getElementById('auth-overlay').style.display = 'none';
        onLoginSuccess(user);
    } catch(err) {
        showAuthError('Login error: ' + err.message);
        console.error('doLogin error:', err);
    }
}

function doRegister() {
    const username = document.getElementById('reg-username').value.trim();
    const display = document.getElementById('reg-display').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    if (!username || !display || !password) return showAuthError('Please fill in all fields.');
    if (password !== confirm) return showAuthError('Passwords do not match.');
    if (password.length < 6) return showAuthError('Password must be at least 6 characters.');
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return showAuthError('Username: letters, numbers, underscore only.');
    const users = getUsers();
    if (users.find(u => u.username === username)) return showAuthError('Username already taken.');
    const newUser = {
        id: Date.now(), username, password: btoa(password), displayName: display,
        role: 'user', status: 'active', createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(), translations: 0, loginCount: 1
    };
    users.push(newUser);
    saveUsers(users);
    setCurrentUser(newUser);
    logActivity(`New user "${username}" registered`, 'register');
    document.getElementById('auth-overlay').style.display = 'none';
    onLoginSuccess(newUser);
}

function onLoginSuccess(user) {
    if (user.role === 'admin' || user.role === 'moderator') {
        document.getElementById('admin-nav-btn').style.display = 'flex';
    }
    var roleColor = getRoleColor(user.role);
    var aiStatus = S.apiKey ? ' · AI Online' : '';
    document.querySelectorAll('.ai-badge').forEach(function(b) {
        b.innerHTML = '<span style="color:' + roleColor + '">' + getRoleBadge(user.role) + '</span> ' + user.displayName + '<span style="opacity:0.6;font-size:10px"> ' + aiStatus + '</span>';
    });
    // Apply permissions - hide locked features
    applyPermissions(user);
    // Bind translation count tracker
    var origUpdate = window.updateHomeStats;
    window.updateHomeStats = function() {
        if (origUpdate) origUpdate();
        var users = getUsers();
        var u = users.find(function(x){ return x.id === user.id; });
        if (u) { u.translations = S.dailyCount; saveUsers(users); }
    };
}

function doLogout() {
    logActivity(`User "${getCurrentUser()?.username}" signed out`, 'logout');
    sessionStorage.removeItem('ass_session');
    location.reload();
}

// ─── ADMIN PANEL ───
function openAdmin() {
    const user = getCurrentUser();
    if (!user || (user.role !== 'admin' && user.role !== 'moderator')) return alert('Access denied.');
    document.getElementById('admin-panel').style.display = 'block';
    renderAdminStats();
    renderAdminUsers();
    renderActivityLog();
}

function closeAdmin() {
    document.getElementById('admin-panel').style.display = 'none';
}

function renderAdminStats() {
    const users = getUsers();
    const today = new Date().toDateString();
    document.getElementById('stat-total').textContent = users.length;
    document.getElementById('stat-active').textContent = users.filter(u => new Date(u.lastActive).toDateString() === today).length;
    document.getElementById('stat-admins').textContent = users.filter(u => u.role === 'admin').length;
    document.getElementById('stat-mods').textContent = users.filter(u => u.role === 'moderator').length;
    document.getElementById('stat-banned').textContent = users.filter(u => u.status === 'banned').length;
}

function getRoleColor(role) {
    if (role === 'admin') return 'var(--accent2)';
    if (role === 'moderator') return 'var(--gold)';
    return 'var(--text2)';
}
function getRoleBadge(role) {
    if (role === 'admin') return '🛡️ Admin';
    if (role === 'moderator') return '⚡ Moderator';
    return '👤 User';
}

function renderAdminUsers(search) {
    if (search === undefined) search = '';
    var users = getUsers();
    var filtered = search ? users.filter(function(u){ return u.username.toLowerCase().includes(search.toLowerCase()) || u.displayName.toLowerCase().includes(search.toLowerCase()); }) : users;
    var tbody = document.getElementById('admin-tbody');
    var currentUser = getCurrentUser();
    var isSuperAdmin = currentUser && currentUser.role === 'admin';

    tbody.innerHTML = filtered.map(function(u) {
        var roleColor = getRoleColor(u.role);
        var roleBadge = getRoleBadge(u.role);
        var statusColor = u.status === 'active' ? 'var(--green)' : 'var(--red)';
        var lastActive = new Date(u.lastActive).toLocaleDateString('vi-VN');
        var isCurrentUser = u.id === (currentUser && currentUser.id);
        var banIcon = u.status === 'banned' ? 'lock-open' : 'ban';
        var banLabel = u.status === 'banned' ? 'Unban' : 'Ban';

        var roleMenuItems = '';
        if (isSuperAdmin && !isCurrentUser) {
            if (u.role !== 'admin') roleMenuItems += '<div class="umenu-item" onclick="setUserRole(' + u.id + ',\'admin\')"><i class="fa-solid fa-shield-halved" style="width:16px;color:var(--accent2)"></i> Promote → Admin</div>';
            if (u.role !== 'moderator') roleMenuItems += '<div class="umenu-item" onclick="setUserRole(' + u.id + ',\'moderator\')"><i class="fa-solid fa-bolt" style="width:16px;color:var(--gold)"></i> Set as Moderator</div>';
            if (u.role !== 'user') roleMenuItems += '<div class="umenu-item" onclick="setUserRole(' + u.id + ',\'user\')"><i class="fa-solid fa-user" style="width:16px"></i> Demote → User</div>';
            roleMenuItems = '<div style="border-top:1px solid var(--border2);margin:4px 0"></div>' + roleMenuItems;
        }

        var deleteBtn = isSuperAdmin ? '<div class="umenu-item danger" onclick="deleteUser(' + u.id + ')"><i class="fa-solid fa-trash" style="width:16px"></i> Delete User</div>' : '';

        var actionsHtml = isCurrentUser
            ? '<span style="font-size:11px;color:var(--text3);padding:4px 8px">Current session</span>'
            : '<div style="position:relative;display:inline-block">'
                + '<button class="btn sm ghost" onclick="toggleUserMenu(' + u.id + ', event)" style="width:32px;height:32px;padding:0;font-size:18px;line-height:1" title="Actions">&#8942;</button>'
                + '<div id="umenu-' + u.id + '" style="display:none;position:absolute;right:0;top:36px;background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:6px;min-width:215px;z-index:5000;box-shadow:0 12px 40px rgba(0,0,0,0.6)">'
                    + '<div style="padding:8px 14px 4px;font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:0.5px">' + u.displayName + '</div>'
                    + '<div style="border-top:1px solid var(--border2);margin:4px 0"></div>'
                    + '<div class="umenu-item" onclick="viewUserActivity(' + u.id + ')"><i class="fa-solid fa-chart-line" style="width:16px;color:var(--green)"></i> View Activity</div>'
                    + '<div class="umenu-item" onclick="openPermissionsModal(' + u.id + ')" title="Grant/revoke features"><i class="fa-solid fa-sliders" style="width:16px;color:var(--accent2)"></i> Permissions</div>'
                    + '<div class="umenu-item" onclick="adminResetPass(' + u.id + ')"><i class="fa-solid fa-key" style="width:16px;color:var(--accent)"></i> Reset Password</div>'
                    + roleMenuItems
                    + '<div style="border-top:1px solid var(--border2);margin:4px 0"></div>'
                    + '<div class="umenu-item ' + (u.status === 'banned' ? '' : 'danger') + '" onclick="toggleBan(' + u.id + ')"><i class="fa-solid fa-' + banIcon + '" style="width:16px"></i> ' + banLabel + '</div>'
                    + deleteBtn
                + '</div>'
              + '</div>';

        var joinDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString('vi-VN') : 'N/A';
        var perms = u.role === 'admin' ? ALL_FEATURES.map(function(f){return f.id;}) : (u.permissions || ALL_FEATURES.map(function(f){return f.id;}));
        var permsBadge = u.role === 'admin' 
            ? '<span style="font-size:11px;color:var(--accent2);font-weight:600">All Access</span>'
            : '<span style="font-size:11px;color:var(--text2)">' + perms.length + '/' + ALL_FEATURES.length + ' features</span>'
              + (perms.length < ALL_FEATURES.length ? ' <span style="font-size:10px;color:var(--red)">restricted</span>' : '');
        return '<tr style="border-bottom:1px solid var(--border2);transition:background 0.2s" onmouseenter="this.style.background=\'rgba(255,255,255,0.02)\'" onmouseleave="this.style.background=\'transparent\'">'
            + '<td style="padding:12px">'
                + '<div style="font-weight:700;color:var(--text)">' + u.displayName + (isCurrentUser ? ' <span style="font-size:10px;color:var(--accent)">(you)</span>' : '') + '</div>'
                + '<div style="font-size:11px;color:var(--text3)">&#64;' + u.username + ' · Joined ' + joinDate + '</div>'
            + '</td>'
            + '<td style="padding:12px"><span style="color:' + roleColor + ';font-weight:700;font-size:11px;background:rgba(255,255,255,0.05);padding:3px 9px;border-radius:6px;border:1px solid ' + roleColor + '">' + roleBadge + '</span></td>'
            + '<td style="padding:12px"><span style="color:' + statusColor + ';font-size:12px;font-weight:600">● ' + u.status + '</span></td>'
            + '<td style="padding:12px;color:var(--text2);font-size:12px">' + lastActive + '</td>'
            + '<td style="padding:12px;color:var(--text2);font-size:12px">' + (u.translations || 0) + '</td>'
            + '<td style="padding:12px">' + permsBadge + '</td>'
            + '<td style="padding:12px;text-align:right"><div style="display:flex;gap:6px;justify-content:flex-end;align-items:center">' + actionsHtml + '</div></td>'
            + '</tr>';
    }).join('');
}

function toggleUserMenu(id, e) {
    e.stopPropagation();
    document.querySelectorAll('[id^="umenu-"]').forEach(function(m){ m.style.display = 'none'; });
    var menu = document.getElementById('umenu-' + id);
    if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}
document.addEventListener('click', function(){ document.querySelectorAll('[id^="umenu-"]').forEach(function(m){ m.style.display = 'none'; }); });

function setUserRole(id, newRole) {
    document.querySelectorAll('[id^="umenu-"]').forEach(function(m){ m.style.display = 'none'; });
    var users = getUsers();
    var u = users.find(function(x){ return x.id === id; });
    if (!u) return;
    var oldRole = u.role;
    u.role = newRole;
    saveUsers(users);
    logActivity('Role changed: "' + u.username + '" ' + oldRole + ' → ' + newRole, 'admin');
    renderAdminStats(); renderAdminUsers();
}

function viewUserActivity(id) {
    document.querySelectorAll('[id^="umenu-"]').forEach(function(m){ m.style.display = 'none'; });
    var users = getUsers();
    var u = users.find(function(x){ return x.id === id; });
    if (!u) return;
    var log = getActivityLog();
    var userLog = log.filter(function(l){ return l.user === u.username; });
    
    // Show in modal
    var modal = document.getElementById('user-activity-modal');
    document.getElementById('ua-title').textContent = u.displayName + ' (&#64;' + u.username + ')';
    document.getElementById('ua-meta').innerHTML = 
        'Role: <b style="color:' + getRoleColor(u.role) + '">' + getRoleBadge(u.role) + '</b>' +
        ' · Status: <b style="color:' + (u.status==='active'?'var(--green)':'var(--red)') + '">' + u.status + '</b>' +
        ' · Logins: <b>' + (u.loginCount||0) + '</b>' +
        ' · Translations: <b>' + (u.translations||0) + '</b>';
    
    var typeColor = { login: 'var(--green)', logout: 'var(--text2)', register: 'var(--accent)', admin: 'var(--accent2)', info: 'var(--text3)' };
    var logHtml = userLog.length ? userLog.map(function(l){
        return '<div style="display:flex;gap:10px;align-items:center;padding:9px 12px;background:rgba(255,255,255,0.02);border-radius:9px;border:1px solid var(--border2)">'
            + '<div style="width:7px;height:7px;border-radius:50%;background:' + (typeColor[l.type]||'var(--text3)') + ';flex-shrink:0"></div>'
            + '<div style="flex:1;font-size:13px">' + l.msg + '</div>'
            + '<div style="font-size:11px;color:var(--text3);white-space:nowrap">' + l.time + '</div>'
            + '</div>';
    }).join('') : '<div style="text-align:center;color:var(--text3);padding:24px;font-size:13px">No activity recorded for this user.</div>';
    
    document.getElementById('ua-log').innerHTML = logHtml;
    modal.style.display = 'flex';
}

function adminResetPass(id) {
    document.querySelectorAll('[id^="umenu-"]').forEach(function(m){ m.style.display = 'none'; });
    var newPass = prompt('Enter new password for this user (min 6 characters):');
    if (!newPass) return;
    if (newPass.length < 6) return alert('Password must be at least 6 characters.');
    var users = getUsers();
    var u = users.find(function(x){ return x.id === id; });
    if (!u) return;
    u.password = btoa(newPass);
    saveUsers(users);
    logActivity('Admin reset password for "' + u.username + '"', 'admin');
    alert('Password for "' + u.username + '" has been reset successfully!');
    renderAdminUsers();
}

function toggleBan(id) {
    const users = getUsers();
    const u = users.find(x => x.id === id);
    if (!u) return;
    u.status = u.status === 'banned' ? 'active' : 'banned';
    saveUsers(users);
    var banStatus = u.status === 'banned' ? 'banned' : 'unbanned';
    logActivity('User "' + u.username + '" ' + banStatus, 'admin');
    renderAdminStats(); renderAdminUsers();
}

function deleteUser(id) {
    if (!confirm('Delete this user permanently?')) return;
    const users = getUsers();
    const u = users.find(x => x.id === id);
    const filtered = users.filter(x => x.id !== id);
    saveUsers(filtered);
    logActivity(`User "${u?.username}" deleted`, 'admin');
    renderAdminStats(); renderAdminUsers();
}

function openAddUserModal() {
    document.getElementById('add-user-modal').style.display = 'flex';
}

function doAddUser() {
    const username = document.getElementById('add-username').value.trim();
    const display = document.getElementById('add-display').value.trim();
    const pass = document.getElementById('add-pass').value;
    const role = document.getElementById('add-role').value;
    if (!username || !display || !pass) return alert('Please fill in all fields.');
    const users = getUsers();
    if (users.find(u => u.username === username)) return alert('Username already exists.');
    users.push({
        id: Date.now(), username, password: btoa(pass), displayName: display,
        role, status: 'active', createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(), translations: 0, loginCount: 0
    });
    saveUsers(users);
    logActivity(`Admin created user "${username}" (${role})`, 'admin');
    document.getElementById('add-user-modal').style.display = 'none';
    document.getElementById('add-username').value = '';
    document.getElementById('add-display').value = '';
    document.getElementById('add-pass').value = '';
    renderAdminStats(); renderAdminUsers();
    alert(`✓ User "${username}" created successfully!`);
}

function renderActivityLog() {
    const log = getActivityLog();
    const el = document.getElementById('activity-log');
    if (!log.length) { el.innerHTML = '<div style="color:var(--text3);font-size:13px;text-align:center;padding:20px">No activity yet.</div>'; return; }
    const typeColor = { login: 'var(--green)', logout: 'var(--text2)', register: 'var(--accent)', admin: 'var(--accent2)', info: 'var(--text3)' };
    el.innerHTML = log.map(l => `
        <div style="display:flex;gap:12px;align-items:center;padding:10px 12px;background:rgba(255,255,255,0.02);border-radius:10px;border:1px solid var(--border2)">
            <div style="width:8px;height:8px;border-radius:50%;background:${typeColor[l.type]||'var(--text3)'};flex-shrink:0"></div>
            <div style="flex:1;font-size:13px">${l.msg}</div>
            <div style="font-size:11px;color:var(--text3);white-space:nowrap">${l.time}</div>
        </div>
    `).join('');
}


// ─── CHANGE PASSWORD ───
function openChangePassModal() {
    var user = getCurrentUser();
    if (!user) return;
    document.getElementById('change-pass-user-label').textContent = 'Changing password for: ' + user.displayName + ' (' + user.username + ')';
    document.getElementById('cp-current').value = '';
    document.getElementById('cp-new').value = '';
    document.getElementById('cp-confirm').value = '';
    document.getElementById('cp-error').style.display = 'none';
    document.getElementById('change-pass-modal').style.display = 'flex';
}

function doChangePass() {
    var user = getCurrentUser();
    if (!user) return;
    var current = document.getElementById('cp-current').value;
    var newPass = document.getElementById('cp-new').value;
    var confirm = document.getElementById('cp-confirm').value;
    var errEl = document.getElementById('cp-error');
    errEl.style.display = 'none';

    if (!current || !newPass || !confirm) { errEl.textContent = 'Please fill in all fields.'; errEl.style.display = 'block'; return; }

    var users = getUsers();
    var u = users.find(function(x){ return x.id === user.id; });
    if (!u) return;

    if (u.password !== btoa(current)) { errEl.textContent = 'Current password is incorrect.'; errEl.style.display = 'block'; return; }
    if (newPass.length < 6) { errEl.textContent = 'New password must be at least 6 characters.'; errEl.style.display = 'block'; return; }
    if (newPass !== confirm) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }

    u.password = btoa(newPass);
    saveUsers(users);
    // Update session
    setCurrentUser(u);
    logActivity('User "' + u.username + '" changed their password', 'info');
    document.getElementById('change-pass-modal').style.display = 'none';
    alert('Password changed successfully!');
}

// ─── INIT AUTH ───
(function initAuth() {
    const user = getCurrentUser();
    if (user) {
        // Already logged in this session
        document.getElementById('auth-overlay').style.display = 'none';
        onLoginSuccess(user);
    }
    // else auth overlay stays visible
})();

window.addEventListener('resize', initCanvas);
initCanvas(); drawCanvas();
// Luôn dùng key hardcoded, xóa localStorage để tránh conflict
localStorage.removeItem('ass_api_key');
checkStreak(); updateHomeStats(); renderFiles();
// updateStatus chỉ gọi sau login thành công, không gọi ở đây