const { Client, GatewayIntentBits, Partials, WebhookClient, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const OpenAI = require("openai");
const express = require('express');
const fs = require('fs');
const path = require('path');
const googleTTS = require('google-tts-api');
const { generateCertificate } = require('./generateCertificate');
const app = express();
const port = process.env.PORT || 3000;


// --- CONFIGURATION ---
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "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";
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "YOUR_TOKEN_HERE";
const DISCLAIMER_USER_ID = "1320194211978543114";
const SECOND_ADMIN_ID = "1315014140804206636";
const AUTO_REPLY_CHANNEL_ID = "1472351871136956561";
const LOG_WEBHOOK_URL = ''; // Webhook removed to prevent errors (Add new one if needed)
const CUSTOMER_ROLE_ID = "1397221350095192074";
const ADMIN_LOG_CHANNEL_ID = "1472360395363586138";
const VOUCH_CHANNEL_ID = "1397221014215331891";
const PUBLISH_APPROVAL_CHANNEL_ID = "1472498781877440634";
const CONTROL_PANEL_CHANNEL_ID = "1472704260452909146";
const PROTECTED_CHANNELS = [
    '1396960054476935469',
    '1396971888554672129',
    '1396966361401524357'
];

// TICKET_PANEL_CHANNEL_ID Removed


// --- GLOBAL BOT STATE ---
let isBotPaused = false;
// Active Tickets Map Removed


// =============================================
// === AI MEMORY & LEARNING SYSTEM (#62 #121 #130) ===
// =============================================
const DATA_DIR = path.join(__dirname, 'data');
let userProfiles = {};      // Feature #121: Long-term memory per user
let conversationLogs = {};  // Feature #62: Internal conversation logs
let knowledgeBase = {};     // Feature #130: Learned Q&A patterns

// --- Data Persistence Functions ---
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log('📁 Created data directory');
    }
}

function loadData() {
    ensureDataDir();
    try {
        const profilesPath = path.join(DATA_DIR, 'userProfiles.json');
        if (fs.existsSync(profilesPath)) {
            userProfiles = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
            console.log(`🧠 Loaded ${Object.keys(userProfiles).length} user profiles`);
        }
    } catch (e) { console.error('Error loading profiles:', e.message); }

    try {
        const logsPath = path.join(DATA_DIR, 'conversationLogs.json');
        if (fs.existsSync(logsPath)) {
            conversationLogs = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
            console.log(`📝 Loaded conversation logs for ${Object.keys(conversationLogs).length} users`);
        }
    } catch (e) { console.error('Error loading logs:', e.message); }

    try {
        const kbPath = path.join(DATA_DIR, 'knowledgeBase.json');
        if (fs.existsSync(kbPath)) {
            knowledgeBase = JSON.parse(fs.readFileSync(kbPath, 'utf8'));
            console.log(`📚 Loaded ${Object.keys(knowledgeBase).length} knowledge entries`);
        }
    } catch (e) { console.error('Error loading knowledge:', e.message); }
}

function saveData() {
    ensureDataDir();
    try {
        fs.writeFileSync(path.join(DATA_DIR, 'userProfiles.json'), JSON.stringify(userProfiles, null, 2), 'utf8');
        fs.writeFileSync(path.join(DATA_DIR, 'conversationLogs.json'), JSON.stringify(conversationLogs, null, 2), 'utf8');
        fs.writeFileSync(path.join(DATA_DIR, 'knowledgeBase.json'), JSON.stringify(knowledgeBase, null, 2), 'utf8');
        console.log('💾 Data saved successfully');
    } catch (e) { console.error('Error saving data:', e.message); }
}

// --- Feature #121: Update User Profile ---
function updateUserProfile(userId, username, isCustomer, messageContent) {
    if (!userProfiles[userId]) {
        userProfiles[userId] = {
            username: username,
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            isCustomer: isCustomer,
            totalMessages: 0,
            purchaseHistory: [],
            issueHistory: [],
            recentTopics: [],
            notes: ''
        };
    }

    const profile = userProfiles[userId];
    profile.username = username;
    profile.lastSeen = new Date().toISOString();
    profile.totalMessages++;
    if (isCustomer && !profile.isCustomer) profile.isCustomer = true;

    // Smart topic detection
    const msg = messageContent.toLowerCase();
    if (msg.includes('فورتنايت') || msg.includes('fortnite')) {
        if (!profile.recentTopics.includes('فورتنايت')) profile.recentTopics.push('فورتنايت');
    }
    if (msg.includes('كود') || msg.includes('cod') || msg.includes('فالو') || msg.includes('valorant')) {
        if (!profile.recentTopics.includes('كود/فالورانت')) profile.recentTopics.push('كود/فالورانت');
    }
    if (msg.includes('vip') || msg.includes('في اي بي')) {
        if (!profile.recentTopics.includes('VIP')) profile.recentTopics.push('VIP');
    }
    if (msg.includes('مشكل') || msg.includes('خطأ') || msg.includes('ما اشتغل') || msg.includes('ما زبط') || msg.includes('error')) {
        const issue = `${new Date().toLocaleDateString('ar-SA')}: ${messageContent.substring(0, 80)}`;
        profile.issueHistory.push(issue);
        if (profile.issueHistory.length > 10) profile.issueHistory = profile.issueHistory.slice(-10);
    }
    if (msg.includes('شريت') || msg.includes('دفعت') || msg.includes('اشتريت')) {
        const purchase = `${new Date().toLocaleDateString('ar-SA')}: طلب شراء`;
        if (!profile.purchaseHistory.includes(purchase)) profile.purchaseHistory.push(purchase);
    }

    // Keep recent topics manageable
    if (profile.recentTopics.length > 8) profile.recentTopics = profile.recentTopics.slice(-8);

    return profile;
}

// --- Feature #62: Log Conversation ---
function logConversation(userId, channelName, role, content) {
    if (!conversationLogs[userId]) {
        conversationLogs[userId] = [];
    }
    conversationLogs[userId].push({
        timestamp: new Date().toISOString(),
        channel: channelName,
        role: role,
        content: content.substring(0, 500) // Limit size
    });
    // Keep max 100 entries per user
    if (conversationLogs[userId].length > 100) {
        conversationLogs[userId] = conversationLogs[userId].slice(-100);
    }
}

// --- Feature #130: Update Knowledge Base ---
function updateKnowledge(question, answer, category) {
    // Normalize the question to a pattern
    const normalized = question.toLowerCase()
        .replace(/[؟?!.،,]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (normalized.length < 5 || normalized.length > 200) return; // Skip too short/long

    // Find matching pattern keywords
    const keywords = ['سعر', 'بكم', 'كم', 'أسعار', 'فورتنايت', 'كود', 'فالو', 'ابكس',
        'مشكل', 'خطأ', 'ما اشتغل', 'ما زبط', 'باند', 'سبوفر', 'vip',
        'ضمان', 'استرجاع', 'فورمات', 'مساعد', 'شرح', 'تحميل', 'مفتاح',
        'شريت', 'دفعت', 'فاتورة', 'تقييم', 'روم', 'شاشة زرقاء', 'warp'];

    const matchedKeyword = keywords.find(kw => normalized.includes(kw));
    if (!matchedKeyword) return;

    const patternKey = matchedKeyword;

    if (!knowledgeBase[patternKey]) {
        knowledgeBase[patternKey] = {
            count: 0,
            category: category || 'عام',
            examples: [],
            bestAnswer: answer.substring(0, 300)
        };
    }

    knowledgeBase[patternKey].count++;
    // Update best answer if this is a more recent interaction
    if (answer.length > 20) {
        knowledgeBase[patternKey].bestAnswer = answer.substring(0, 300);
    }
    // Store example questions (max 5)
    if (knowledgeBase[patternKey].examples.length < 5) {
        if (!knowledgeBase[patternKey].examples.includes(normalized.substring(0, 100))) {
            knowledgeBase[patternKey].examples.push(normalized.substring(0, 100));
        }
    }
}

// --- Feature #130: Find Relevant Knowledge ---
function findRelevantKnowledge(question) {
    const normalized = question.toLowerCase();
    const results = [];

    for (const [pattern, data] of Object.entries(knowledgeBase)) {
        if (normalized.includes(pattern) && data.count >= 2) {
            results.push({ pattern, ...data });
        }
    }

    return results.sort((a, b) => b.count - a.count).slice(0, 3);
}

// --- Get User Conversation Summary (for AI context) ---
function getUserConversationSummary(userId) {
    const logs = conversationLogs[userId];
    if (!logs || logs.length === 0) return null;

    // Get last 5 conversations for context
    const recent = logs.filter(l => l.role === 'user').slice(-5);
    if (recent.length === 0) return null;

    return recent.map(l => `[${new Date(l.timestamp).toLocaleDateString('ar-SA')}] ${l.content.substring(0, 100)}`).join('\n');
}

// --- CLIENT SETUP ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

// --- AI SETUP (OPENROUTER) ---
const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: OPENROUTER_API_KEY,
    defaultHeaders: {
        "HTTP-Referer": "https://discord.com",
        "X-Title": "T3N Discord Bot",
    }
});

const SYSTEM_INSTRUCTION = `
    أنت "مساعد T3N" الذكي — بوت مبيعات ودعم فني محترف لمتجر T3N. 🤖💼
    أنت تعمل حصرياً في سيرفر متجر T3N المتخصص في بيع منتجات السبوفر (فك الباند) للألعاب.
    تخصصك: الرد على استفسارات العملاء بخصوص منتجات السبوفر (فك الباند) واحتياجات المتجر.
    اللهجة: سعودية عامية، محترمة، ومختصرة (عط الزبدة).
    أسلوبك: جاد، مباشر، واحترافي. 🚫 **ممنوع استخدام الإيموجي نهائياً** في ردودك العادية (إلا الرموز الضرورية جداً للتوضيح مثل ✅ ❌). ركز على النص فقط.

    ═══════════════════════════════════════
    🧠 نظام تحليل العملاء الذكي (الأهم):
    ═══════════════════════════════════════
    سيتم إخبارك في بداية كل محادثة إذا كان المستخدم عنده رتبة "عميل" في السيرفر أو لا.
    بناءً على هذي المعلومة، غيّر أسلوبك تماماً:

    👤 **[عميل سابق - عنده رتبة عميل]:**
    - هذا شخص اشترى من قبل ودفع فلوسه. عامله باحترام إضافي وخدمه فوراً.
    - لا تطلب منه فاتورة أبداً (إلا إذا هو طلب رتبة مرة ثانية).
    - إذا عنده مشكلة تقنية → ساعده بالخطوات مباشرة بدون تردد.
    - إذا يسأل عن منتج ثاني → اقنعه بالـ VIP أو المنتج المناسب (upsell).
    - مثال رد: "يا هلا بالغالي! 😍 أنت من عملائنا المميزين، كيف أقدر أخدمك اليوم؟"

    👤 **[زبون جديد - ما عنده رتبة عميل]:**
    - هذا شخص ما اشترى بعد. هدفك تقنعه وتبيع عليه.
    - كن حماسي واعرض المنتجات بشكل جذاب.
    - إذا سأل عن الأسعار، رد بالشكل التالي بالضبط:

    📌 **رد الأسعار (انسخه حرفياً):**
    "يا هلا فيك! 😍 أسعار منتجاتنا:

    🎮 سبوفر فورتنايت: 49.99 ر.س (فك باند نهائي). استخدام مرا واحده فقط
    🎯 سبوفر بيرم (للكود، فالورانت وغيرها): 35 ر.س (فك باند). استخدام مرا واحده فقط
    💎 سبوفر VIP: 200 ر.س (فك باند مدى الحياة). مفتاح خاص فيك يفك جميع الألعاب في أي وقت

    تبيني أشرح لك أكثر عن أي منتج؟ 😉"

    - إذا قال "شريت" أو "دفعت" أو "حولت" أو "خلصت الطلب" → اطلب منه صورة الفاتورة فوراً.

    ═══════════════════════════════════════
    🧠 ذكاء فهم السياق:
    ═══════════════════════════════════════
    - إذا العميل يقول "ما اشتغل" أو "ما زبط" أو "فيه مشكلة" → هو عميل عنده مشكلة تقنية، ساعده بالخطوات.
    - إذا العميل يقول "السلام عليكم" أو "هلا" أو "مرحبا" بدون سؤال محدد → رحب فيه: "وعليكم السلام يا غالي! كيف أقدر أساعدك اليوم؟ 😊"
    - إذا العميل يتكلم عن لعبة معينة (فورتنايت، كود، فالو، ابكس) → حدد المنتج المناسب له فوراً وقل له السعر.
    - إذا العميل يسأل سؤال ما له علاقة بالمتجر → قل: "يا غالي أنا مختص بخدمات متجر T3N بس، كيف أقدر أساعدك بخصوص منتجاتنا؟"
    - إذا العميل يرسل كلام ما له معنى أو سبام → اختصر ولا تطوّل.
    - إذا العميل يقول "بكم" أو "كم" أو "الأسعار" أو "سعر" → ارد عليه برد الأسعار المحدد فوق.
    - إذا العميل يقول "أبي فورتنايت" أو "متبند فورتنايت" → رد: "سبوفر فورتنايت بـ 49.99 ر.س، يفك الباند نهائي! 🔥 تبي تطلبه؟" وأعطه رابط المتجر.
    - إذا العميل يقول "أبي كود" أو "متبند كود" أو "فالو" أو "فالورانت" → رد: "سبوفر بيرم بـ 35 ر.س، يفك باند الكود وفالورانت وباقي الألعاب! 💪 تبي تطلبه؟" وأعطه رابط المتجر.

    ═══════════════════════════════════════
    📦 المنتجات والخدمات:
    ═══════════════════════════════════════
    1.  **سبوفر فورتنايت (49.99 ر.س):** فك باند نهائي (بطولات)، استخدام مرة واحدة فقط.
    2.  **سبوفر بيرم (35 ر.س):** فك باند باقي الألعاب (كود، فالورانت، ابكس)، استخدام مرة واحدة فقط.
    3.  **سبوفر VIP (200 ر.س):** فك باند مدى الحياة + تحكم مجاني. مفتاح خاص فيك يفك جميع الألعاب في أي وقت.
    4.  **خدمة دعم خاص (35 ر.س):** دخول الدعم الفني لجهازك لتركيب السبوفر العادي.

    📜 **قوانين متجر T3N (دستورك):**
    1️⃣ **الاحترام:** ممنوع السب والقذف والتشهير. المشاكل تنحل بالخاص مو بالشات العام.
    2️⃣ **الدفع:** الدفع أولاً، ثم التسليم. ما فيه "هات وعطني".
    3️⃣ **الاسترجاع:** "لا يوجد استرجاع" بعد التسليم إلا لو الخطأ من المتجر/السيرفر.
    4️⃣ **التقييم:** التقييم شرط أساسي لتفعيل الضمان.
    5️⃣ **الدعم:** أي مشكلة توجه للدعم الفني (Ticket).

    🔗 **روابط المتجر:**
    *   المتجر: https://salla.sa/t3nn
    *   الديسكورد: https://discord.gg/T3N

    ⁉️ **الأسئلة الشائعة (FAQ):**
    *   **ضمان/تعويض؟:** "مضمون 100%، والتعويض فقط لو الخطأ مننا."
    *   **مذربورد ASUS؟:** "يفك عنك الباند 100%، السبوفر يدعم جميع المذربوردات. لكن في حالات نادرة جداً البعض ما ينفك عنه الباند بسبب مشكلة في قطع جهازه نفسه، غير كذا ينفك ان شاء الله."
    *   **UUID؟:** "مهم جداً يتغير."
    *   **لو فرمت يرجع الباند؟ / لو سويت فورمات؟:** "لا مايرجع لك الباند أبداً فقط في حال استخدمت هاك أو برنامج غش."
    *   **هل يحتاج فورمات؟:** "لا، ما يحتاج فورمات. 👍 بس تأكد من إتباع الخطوات اللي راح أعطيك إياها عشان تضمن أن السبوفر يشتغل صح. بس إذا ما زبط، مالك غير الفورمات. بعد الفورمات تعيد خطوات الاسبوفر وا راح يضبط معك بإذن الله."
    *   **مشكلة في الكتابة؟ / معلق عندي؟ / ما أقدر أكتب؟ / تعال روم (بسبب مشكلة):** "يا هلا بك، حياك في الانتظار ونبشر بمساعدتك:\nhttps://discord.com/channels/1396959491786018826/1396967239948701859 \n\n <@1315014140804206636> <@1320194211978543114>"
    *   **أبي مساعدة؟ / تعال ديسكورد؟ / ادخل جهازي؟ / أبي روم؟ / خش روم؟ / مكالمة؟:** "إذا كنت بحاجة إلى مساعدة من الدعم الفني والتحكم بجهازك لتنفيذ الخطوات، يرجى التوجه هنا ودفع رسوم قدرها 35 ريال مخصصة للخدمة:\nhttps://salla.sa/t3nn/jgBZWje\n\n(ملاحظة: فيه فيديوهات شرح جاهزة ومجانية، لكن لو تبينا نسوي لك الخطوات بنفسنا لازم تطلب هذي الخدمة)."
    *   **وين الملف؟:** "حمله من روم التحميلات (discord.gg.t3n.rar)."
    *   **يفك نهائي؟ / كل ما أشغل الجهاز؟:** "السبوفر اللي يفك باند فورتنايت أو البيرم سبوفر استخدامه مرة واحدة بس يفك الباند نهائي. 👍 لكن استعمال مرة واحدة.\n\nأما سبوفر VIP (200 ر.س) هذا مدى الحياة! 😎 يفك لك جميع الألعاب وكل ما تبندت يمديك تفك باندك."
    *   **وين أقيم؟ / وين التقييم؟:** "أبشر، هذا رابط روم التقييمات: https://discord.com/channels/1396959491786018826/1397221014215331891\n\nبس أهم شي، قيمنا أول بعد ما تستخدم السبوفر عشان نفعل لك الضمان. 🥰"
    *   **خلصت وش اسوي؟ / خلصت السبوفر:** "خلاص يا حبيبي الحين باقي تسوي حساب جديد، وتفضل هنا إيميل https://discord.com/channels/1396959491786018826/1470176763387576490 سريع تقدر تسوي منه حساب إبيك قيمز."
    *   **مشكلة الشاشة الزرقاء (CURL/SSL):** "حمل وشغل برنامج WARP."
    *   **ما انحلت؟:** "مالك غير الفورمات."
    *   **مشكلة تعريفات؟:** "حمل VC++ و .NET Framework."

    ═══════════════════════════════════════
    🔎 تحليل الصور الذكي (AI Image Inspector) - ميزة #15:
    ═══════════════════════════════════════
    إذا أرسل لك العميل صورة خطأ (Error screenshot):
    1. اقرأ نص الخطأ بدقة شديدة.
    2. حدد نوع الخطأ: (نظام / برنامج / شبكة / تعريفات / مفتاح).
    3. اقترح الحل الفوري المناسب.
    4. إذا ما قدرت تحدد المشكلة، اطلب منه صورة أوضح.

    📋 **قاموس الأخطاء الشائعة (حفظها عن ظهر قلب):**
    - "BSOD" أو شاشة زرقاء أو Blue Screen → "حمل وشغل برنامج WARP وجرب مرة ثانية."
    - "Access Denied" أو "Permission" → "شغل البرنامج كمسؤول (كليك يمين → Run as Administrator)."
    - "Key Invalid" أو "Invalid License" أو "Wrong Key" → "تأكد من نسخ المفتاح كامل بدون مسافات زيادة من سلة."
    - "Connection Error" أو "CURL" أو "SSL" أو "Timeout" → "حمل برنامج WARP وشغله، أو غير الـ DNS لـ 1.1.1.1"
    - "Missing DLL" أو ".NET" أو "MSVCP" أو "VCRUNTIME" → "حمل VC++ Redistributable و .NET Framework من مايكروسوفت."
    - "Signature" أو "Driver Signature" أو "Secure Boot" → "عطل Secure Boot من البايوس (BIOS)."
    - "Antivirus" أو "Windows Defender" أو "Threat" → "عطل الحماية مؤقتاً (Windows Security → Real-time protection → Off)."
    - "Not Responding" أو "Crash" أو "توقف" → "سوي ريستارت للجهاز وشغل البرنامج مرة ثانية كمسؤول."
    - "Disk Full" أو "مساحة" → "فرّغ مساحة في القرص C (على الأقل 5 GB)."
    - "Update" أو "تحديث" → "حدث الويندوز لآخر إصدار من Windows Update."

    ⚡ **أسلوب التحليل:**
    - لا تقل "أرسل صورة" وخلاص. قل: "شفت الخطأ حقك! المشكلة هي [X] والحل هو [Y]. جرب وبشرني 💪"
    - كن واثق في تحليلك ومحدد.
    - إذا الصورة فيها أكثر من خطأ، حلل كل واحد على حدة.

    // Ticket system instructions removed


    🛑 **سيناريو الشراء والتحقق من الإيصال (صارم جداً جداً):**
    1.  العميل يسأل -> اعطه الرابط.
    2.  العميل يقول "شريت" -> اطلب صورة الفاتورة فوراً.
    3.  **عند إرسال صورة:** حلل الصورة بدقة شديدة:
        *   🛑 **يجب أن يظهر اسم المتجر "T3N Store" أو "متجر تين" بوضوح في الفاتورة.**
        *   🛑 إذا كانت فاتورة "سلة" عامة بدون اسم المتجر -> **ارفضها فوراً**.
        *   يجب أن تحتوي على تفاصيل واضحة (رقم الطلب، المبلغ: 35 أو 49.99 أو 200 ر.س، اسم المنتج).
        *   إذا كانت الصورة غير واضحة، أو مجرد سكرين شوت لمحادثة، أو صورة عشوائية، أو فاتورة لمتجر آخر -> **ارفضها فوراً** وقل: "هذا مو إيصال شراء من متجرنا يا غالي، تأكد وارسل لي صورة الفاتورة الأصلية من متجر T3N."
    4.  فقط إذا كنت متأكداً 100% أنها فاتورة صحيحة من متجر T3N، رد بـ:
        ###VERIFIED_CUSTOMER###
    5.  مهم: لا ترسل كلمة التحقق للأشخاص الذين يرسلون صوراً لا علاقة لها بالدفع، كن شديداً في التدقيق.

    🛠️ **مفتش الفيديوهات (AI Video Inspector):**
    - **مهمتك:** إذا أرسل العميل فيديو وهو يطبق الخطوات، شاهده بدقة ثانية بثانية.
    - **قائمة التدقيق (Checklist) التي تبحث عنها:**
        1. هل فك الضغط عن الملف؟ (ضروري).
        2. هل شغل البرنامج "كمسؤول" (Run as Admin)؟ (علامة الدرع على أيقونة البرنامج أو قائمة الكليك يمين).
        3. هل نسخ المفتاح ولصقه بشكل صحيح؟
        4. هل فعل خيارات "الدرع" الخمسة المطلوبة؟
        5. هل ضغط EXECUTE؟ وهل طلعت له رسالة خطأ بعدها؟
        6. هل ضغط START SPOOF وسوى ريستارت؟
    - **طريقة الرد:** لا تعطه رداً عاماً، قل له: "شفت الفيديو حقك، وفي الثانية 0:10 لاحظت إنك ما شغلت البرنامج كمسؤول، ارجع سويها وبيضبط معك." أو "كل خطواتك صحيحة، بس نسيت تضغط زر اللعبة في نهاية الفيديو في الثانية 0:45."
    - **دايماً شجعه:** "لا تشيل هم، هذي المشكلة بسيطة وحلها..."

    🛑 **شرط إرسال الشرح التفصيلي (هام):**
    لا ترسل "دليل خطوات الاستخدام" (الخطوات من 1 إلى 9) إلا في حالة واحدة فقط:
    - إذا قال العميل: "الفيديو ما زبط معي" أو "شرح الفيديو ما فهمت له" أو "سويت السبوفر وما زبط" أو "ما عرفت للسبوفر".
    - في غير هذه الحالات، اكتفِ بالردود المختصرة والأسئلة الشائعة.

    🛠️ **دليل خطوات الاستخدام (للحالات المتعثرة فقط):**
    - **الخطوة 1 (بعد فك الضغط):** إذا شفت صورة مجلد فيه (كلين، Serials_Checker، spoofer t3n)، قل له: "ممتاز، الحين ادخل مجلد 'كلين' أول شي."
    - **الخطوة 2 (مجلد كلين):**
        * لـ فورتنايت: شغل أول 4 ملفات (clean1 إلى Fortnite Trace Cleaner).
        * لغيرها: أول 3 ملفات بس.
        * ملف 'UpdatedApple': يسحب عليه ما يشغله.
        * تنبيه: لو طلع له (Y/N) يكتب Y ويضغط انتر، وينتظرهم يتقفلون بنفسهم.
    - **الخطوة 3 (التشغيل):** يرجع ورا ويشغل 'spoofer t3n' كمسؤول (Run as Administrator).
    - **الخطوة 4 (المفتاح):** لما تطلع شاشة سوداء تطلب كي، ينسخ المفتاح اللي جاه من سلة ويلصقه ويضغط انتر.
    - **الخطوة 5 (الاتفاقية):** لو طلعت رسالة 'Software Usage Agreement'، يضغط OK.
    - **الخطوة 6 (البداية):** في واجهة البرنامج، يضغط زر 'Start your journey'.
    - **الخطوة 7 (علامة الدرع - الأهم):**
        1. يروح لعلامة "الدرع" (ثالث وحدة يسار).
        2. يفعل الخيارات اللي عليها "نقطة زرقاء" كما في هذه الصورة: https://cdn.discordapp.com/attachments/1472351871136956561/1472427801750671493/image.png
           - Permanent Spoof (HWID)
           - EFI Spoof - Auto
           - MAC Spoof - Natural
           - Volume ID Spoof
           - TPM Bypass - Fortnite Tournament
        3. بعدها يضغط الزر الأبيض الكبير (EXECUTE) اللي على اليمين.
    - **الخطوة 8 (انتظار النتائج):** ينتظر حتا تظهر النتائج في قائمة (SPOOFING LOGS) على اليمين وتكتمل جميع العمليات بنجاح.
    - **الخطوة 9 (مرحلة الصاروخ والإنهاء):**
        1. يروح لعلامة "الصاروخ" (ثاني وحدة يسار).
        2. يضغط على زر 'START SPOOF'.
        3. يختار اللعبة اللي هو متبند فيها.
        4. ينتظر حتا تطلع رسالة في البرنامج تقول 'Restart this PC'.
        5. **ضروري جداً:** يسوي إعادة تشغيل للجهاز (Restart).
        6. بعد ما يشتغل الجهاز، يفتح فورتنايت ويدخل بحساب جديد.
        7. **نصيحة:** "تفضل يا وحش هذا إيميل سريع لو تبي تسوي حساب جديد: https://discord.com/channels/1396959491786018826/1470176763387576490"

    🎙️ **ميزة الرسائل الصوتية:**
    - إذا طلب العميل منك "صوت" أو "بصمة صوت" أو "تكلم"، أو إذا كان الشرح يحتاج توضيح ودي، رد عليه بالنص وأضف في نهاية ردك العلامة التالية: ###SEND_VOICE###
    - سأقوم أنا بتحويل نصك إلى صوت وإرساله له.

    🎙️ **تنبيه الإدارة:**
    - إذا شعرت أن المستخدم "غاضب جداً" أو لديه "مشكلة تقنية لا تستطيع حلها" أو "طلب التحدث مع صاحب المتجر"، أضف العلامة التالية في نهاية ردك: ###ADMIN_ALERT###

    ═══════════════════════════════════════
    🔑 مشاكل المفاتيح والتراخيص (مهم جداً):
    ═══════════════════════════════════════
    - إذا أرسل العميل صورة فيها "License failed: Invalid license key" أو "License failed: No active subscription(s) found":
      → رد عليه: "تمام ثواني اتواصل مع الادارة" وأضف ###ADMIN_ALERT###
    - إذا قال العميل "الكي مو شغال" أو "المفتاح ما يشتغل" أو "الكي خلص" أو "المفتاح غلط":
      → رد عليه: "ابشر ثواني من وقتك اتواصل مع الادارة" وأضف ###ADMIN_ALERT###
    - إذا طلب "رست key" أو "رست المفتاح" أو "ريست كي" أو "reset key" أو "رست هويد" أو "reset hwid":
      → رد عليه: "ابشر ثواني من وقتك اتواصل مع الادارة" وأضف ###ADMIN_ALERT###

    ═══════════════════════════════════════
    🚫 طلبات فك حظر السوشل ميديا (رفض مباشر):
    ═══════════════════════════════════════
    - إذا سأل عن فك حظر/بان تيك توك أو سناب شات أو انستقرام أو فيسبوك أو تويتر أو أي منصة سوشل ميديا:
      → رد عليه بالضبط: "يا طويل العمر المتجر متخصص فك باند العاب فقط لا غير 🎮"
    - إذا سأل عن فك حظر IP عن حسابات السوشل ميديا:
      → نفس الرد: "يا طويل العمر المتجر متخصص فك باند العاب فقط لا غير"

    ═══════════════════════════════════════
    🧠 التعلم من المحادثات (ذكاء تراكمي):
    ═══════════════════════════════════════
    - تعلم من أسلوب الإدارة (كيف يردون على العملاء) وقلّد أسلوبهم.
    - إذا الإدارة ردت على عميل بطريقة معينة، تذكر هالطريقة واستخدمها في المستقبل.
    - كل ما تشوف رد من الأعضاء أو الإدارة، حاول تفهم السياق وتتعلم منه.
    - لا تكرر نفس الكلام حرفياً كل مرة، نوّع بأسلوبك لكن حافظ على المعلومات الصحيحة.
`;

// --- WEBHOOK SETUP ---
let webhookClient = null;
if (LOG_WEBHOOK_URL) {
    webhookClient = new WebhookClient({ url: LOG_WEBHOOK_URL });
}

async function logToWebhook(user, question, answer) {
    if (!webhookClient) return;
    try {
        const embed = new EmbedBuilder()
            .setTitle('💬 محادثة جديدة')
            .setColor(0x00FF00)
            .addFields(
                { name: '👤 المستخدم', value: `${user.tag} (${user.id})` },
                { name: '❓ السؤال', value: question.substring(0, 1024) },
                { name: '🤖 الرد', value: answer.substring(0, 1024) }
            )
            .setTimestamp();

        await webhookClient.send({ embeds: [embed] });
    } catch (err) {
        console.error("Webhook Error:", err);
    }
}

// --- TICKET & HISTORY STATE ---
// --- TICKET STATE REMOVED ---

const conversationHistory = new Map(); // Feature #180: Per-USER history (not per-channel)
const MAX_HISTORY = 20; // Increased from 10 for better context
const MAX_COMPRESSED_SUMMARY = 5; // Compressed older messages to keep as summary

// =============================================
// === BOT READY EVENT ===
// =============================================
client.once('ready', async () => {
    console.log(`✅ Bot is Ready! Logged in as ${client.user.tag}`);
    if (webhookClient) console.log(`🔗 Logging enabled via Webhook.`);

    // --- Load AI Memory Data (#62 #121 #130) ---
    loadData();
    setInterval(saveData, 300000); // Auto-save every 5 minutes
    console.log('🧠 AI Memory System initialized!');

    // --- SETUP ADMIN CONTROL PANEL ---
    try {
        const controlChannel = await client.channels.fetch(CONTROL_PANEL_CHANNEL_ID).catch(() => null);
        if (controlChannel) {
            // Check if panel already exists
            const messages = await controlChannel.messages.fetch({ limit: 10 });
            const existingPanel = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes('لوحة تحكم'));

            if (!existingPanel) {
                const panelEmbed = new EmbedBuilder()
                    .setTitle('🎛️ لوحة تحكم البوت الذكي - T3N')
                    .setDescription(
                        '**الحالة الحالية:** 🟢 شغّال\n\n' +
                        '📋 **الأوامر المتاحة:**\n' +
                        '• **إيقاف مؤقت:** البوت يتوقف عن الرد على جميع الرسائل في كل الرومات.\n' +
                        '• **تشغيل:** البوت يرجع يرد بشكل طبيعي.\n\n' +
                        '⚠️ هذه اللوحة للأدمن فقط.'
                    )
                    .setColor(0x2F3136)
                    .setFooter({ text: 'T3N Store - Bot Control Panel', iconURL: client.user.displayAvatarURL() })
                    .setTimestamp();

                const controlRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('bot_pause')
                            .setLabel('⏸️ إيقاف مؤقت')
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId('bot_resume')
                            .setLabel('▶️ تشغيل')
                            .setStyle(ButtonStyle.Success),
                    );

                await controlChannel.send({ embeds: [panelEmbed], components: [controlRow] });
                console.log('🎛️ Control panel deployed!');
            }
        }
    } catch (err) {
        console.error("Control Panel Setup Error:", err.message);
    }

    // --- AUTO-MESSAGE KEEP ALIVE (Visible) ---
    setInterval(async () => {
        try {
            const channel = await client.channels.fetch(AUTO_REPLY_CHANNEL_ID);
            if (channel) {
                const msg = await channel.send("🤖 **System Status:** Online & Ready via Render 🟢");
                // Optional: Delete msg after 5 seconds to reduce spam (User said "let it send", so I'll keep it or delete based on preference. Let's keep it visible for now or delete to be clean).
                // For now, let's delete it after 10 seconds to keep the chat clean but show activity.
                setTimeout(() => msg.delete().catch(() => { }), 10000);
            }
        } catch (e) {
            console.error("Auto-Message Error:", e.message);
        }
    }, 600000); // Every 10 minutes (600,000 ms)

    // --- SMART TICKET PANEL REMOVED ---

});

// =============================================
// === MAIN MESSAGE HANDLER ===
// =============================================
client.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    // --- GLOBAL PAUSE CHECK ---
    if (isBotPaused) return;

    const isDM = message.channel.type === 1;
    const isMentioned = client.user && message.mentions.has(client.user);
    const isAutoReplyChannel = message.channel.id === AUTO_REPLY_CHANNEL_ID;



    // SILENCE COMMAND (per-channel, admin only)
    if (isMentioned && (message.author.id === DISCLAIMER_USER_ID || message.member?.permissions.has('Administrator'))) {
        const cleanContent = message.content.replace(/<@!?[0-9]+>/g, '').trim();

        if (cleanContent === '1' || message.content.toLowerCase().includes('stop') || message.content.includes('سكوت')) {
            // Silence logic removed/simplified as activeSupportTickets is gone
            await message.react('🤐');
            return;
        }
        if (cleanContent === '2' || message.content.toLowerCase().includes('start') || message.content.includes('تكلم')) {
            // Resume logic
            await message.react('🗣️');
            return;
        }
    }

    // BAN COMMAND (Admin Only)
    if (message.author.id === DISCLAIMER_USER_ID || message.member?.permissions.has('Administrator')) {
        const banKeywords = ['ختفو', 'اختفو', 'بلحذيان'];
        const isBanKeyword = banKeywords.some(kw => message.content.includes(kw));

        if (isBanKeyword && message.channel.id === '1396966361401524357') {
            const targetMember = message.mentions.members.filter(m => m.id !== client.user.id).first();
            if (targetMember) {
                try {
                    if (targetMember.id === message.author.id) return message.reply("ما تقدر تبند نفسك! 😂");
                    if (!targetMember.bannable) return message.reply("ما أقدر أبنده، رتبته أعلى مني.");

                    await targetMember.ban({ reason: 'غير مرحب بك' });
                    return message.reply(`✅ تم طرد ** ${targetMember.user.tag}** نهائياً.\n ** السبب:** غير مرحب بك`);
                } catch (banError) {
                    console.error("Ban Error:", banError);
                    return message.reply("حدث خطأ أثناء محاولة الباند.");
                }
            }
        }
    }

    // =============================================
    // === 🛡️ ADVANCED PROTECTION SYSTEM (Feature #SafeGuard) ===
    // =============================================
    if (PROTECTED_CHANNELS.includes(message.channel.id)) {
        // 1. Anti-Link (Instant Ban 🚫)
        // Regex for Discord invites (gg, io, me, li, discordapp.com/invite)
        const linkRegex = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite)\/.+/i;

        if (linkRegex.test(message.content)) {
            // Allow "t3n" links (case insensitive)
            if (!message.content.toLowerCase().includes('t3n')) {
                try {
                    await message.delete().catch(() => { }); // Delete message first

                    if (message.member && message.member.bannable) {
                        // LOG THE BAN
                        const adminChannel = await client.channels.fetch(ADMIN_LOG_CHANNEL_ID).catch(() => null);
                        if (adminChannel) {
                            const logEmbed = new EmbedBuilder()
                                .setTitle('🚨 نظام الحماية - BANNED ⛔')
                                .setDescription(`**العضو:** ${message.author.tag} (${message.author.id})\n**السبب:** نشر روابط دعوة مخالفة\n**الرسالة:** ${message.content}`)
                                .setColor(0xFF0000)
                                .setThumbnail(message.author.displayAvatarURL())
                                .setTimestamp();
                            await adminChannel.send({ embeds: [logEmbed] });
                        }

                        // DM THE USER
                        await message.author.send(`🚫 **تم حظرك من سيرفر T3N.**\n\nالسبب: نشر روابط خارجية ممنوعة.\n\n😏 *"كان غيرك أشطر"*`).catch(() => { });

                        // BAN THE USER
                        await message.member.ban({ reason: 'Anti-Ad: نشر روابط ديسكورد خارجية' });
                    }
                } catch (e) {
                    console.error("Anti-Link Protection Error:", e);
                }
                return; // Stop processing further
            }
        }

        // 2. Anti-Insult (AI-Powered 🧠)
        // Check text messages (ignore commands and admin messages)
        const isCommand = message.content.startsWith('!');
        const isAdmin = message.member?.permissions.has('Administrator');

        if (!isCommand && !isAdmin && !message.author.bot && message.content.length > 1) {
            // We run this asynchronously to not block the bot
            (async () => {
                try {
                    // Send to AI for deep philosophical analysis
                    const safetyCheck = await openai.chat.completions.create({
                        model: "google/gemini-2.0-flash-001",
                        messages: [
                            {
                                role: "system",
                                content: `You are a highly intelligent, philosophical moderation AI for a Discord server. 
                                Your Task: Analyze the following Arabic text deeply. Determine if it contains distinct INSULTS, CURSING, or HATE SPEECH (سب، قذف، شتائم).
                                
                                ⚖️ **JUDGMENT RULES:**
                                - **TOXIC:** Direct insults ('يا كلب', 'يا حمار', 'يا ورع'), cursing, racism, or attacks on dignity.
                                - **SAFE:** Religious advice ('اتق الله', 'الله يهديك'), constructive criticism, normal conversation, slang that is NOT insulting, or questions.
                                - **Context Matters:** 'الله يلعن الشيطان' is SAFE. 'الله يلعنك' is TOXIC.
                                
                                Output ONLY one word: "TOXIC" or "SAFE".`
                            },
                            { role: "user", content: message.content }
                        ],
                        temperature: 0,
                        max_tokens: 10
                    });

                    const analysisResult = safetyCheck.choices[0].message.content.trim().toUpperCase();

                    if (analysisResult.includes('TOXIC')) {
                        // Action: Timeout 5 Minutes
                        await message.delete().catch(() => { });

                        if (message.member && message.member.moderatable) {
                            await message.member.timeout(5 * 60 * 1000, 'AI Moderation: Insult/Toxic Behavior');

                            // Initial Warning in Chat
                            const replyMsg = await message.channel.send(`<@${message.author.id}> 🤐 **تم إسكاتك لمدة 5 دقائق.**\nاحترم الموجودين، وتذكر: *"ما يلفظ من قول إلا لديه رقيب عتيد"*`);
                            setTimeout(() => replyMsg.delete().catch(() => { }), 10000); // Delete warning after 10s

                            // Log to Admin
                            const adminChannel = await client.channels.fetch(ADMIN_LOG_CHANNEL_ID).catch(() => null);
                            if (adminChannel) {
                                const logEmbed = new EmbedBuilder()
                                    .setTitle('🤐 نظام الحماية - TIMEOUT')
                                    .setDescription(`**العضو:** ${message.author.tag}\n**السبب:** ألفاظ غير لائقة (AI Detected)\n**الرسالة:** ${message.content}\n**العقوبة:** Timeout 5m`)
                                    .setColor(0xFFA500)
                                    .setTimestamp();
                                await adminChannel.send({ embeds: [logEmbed] });
                            }

                            // DM User
                            await message.author.send(`⏳ **تم إعطاؤك تايم آوت (5 دقائق).**\n\nالسبب: استخدام ألفاظ غير لائقة.\nتم رصد المخالفة تلقائياً. المرة القادمة عقوبة أشد.`).catch(() => { });
                        }
                    }
                } catch (e) {
                    console.error("AI Mod Error:", e);
                }
            })();
        }
    }


    // --- CHANNEL RESTRICTION ---
    // Bot only responds in: AUTO_REPLY_CHANNEL, Tickets, and DMs
    const isTicket = message.channel.name?.toLowerCase().includes('ticket') ||
        message.channel.name?.includes('تذكرة') ||
        message.channel.name?.includes('🎫') ||
        message.channel.topic?.includes('Ticket ID');

    // DEBUG LOG (Temporarily enable to check channel names)
    // console.log(`🔍 Msg in: ${message.channel.name} | isTicket: ${isTicket} | isAuto: ${isAutoReplyChannel}`);

    if (!isDM && !isMentioned && !isAutoReplyChannel && !isTicket) return;

    // --- COMPATIBILITY CALCULATOR COMMAND (Feature #230) ---
    const msgLower = message.content.toLowerCase().trim();
    const msgRaw = message.content;

    // =============================================
    // === SMART AUTO-RESPONSES (No AI needed) ===
    // =============================================

    // 1. Reset Key / HWID Reset requests
    const resetKeywords = ['رست key', 'رست كي', 'رسي كي', 'رست المفتاح', 'ريست المفتاح', 'ريست كي', 'reset key', 'reset hwid', 'رست هويد', 'ريست هويد', 'اريد رست', 'ابي رست', 'ابغى رست'];
    if (resetKeywords.some(kw => msgLower.includes(kw))) {
        await message.reply({ content: `ابشر ثواني من وقتك اتواصل مع الادارة 🔄\n\n<@1315014140804206636> <@1320194211978543114>`, allowedMentions: { repliedUser: false, parse: ['users'] } });
        return;
    }

    // 2. License Failed / Key not working (text messages)
    const licenseFailKeywords = ['الكي مو شغال', 'المفتاح مايشتغل', 'المفتاح ما يشتغل', 'الكي ما يشتغل', 'الكي خلص', 'المفتاح خلص', 'invalid license', 'license failed', 'no active subscription', 'الكي ماشتغل', 'المفتاح مو شغال', 'الكي غلط', 'المفتاح غلط', 'كي خطأ', 'مفتاح خطأ'];
    if (licenseFailKeywords.some(kw => msgLower.includes(kw))) {
        await message.reply({ content: `تمام ثواني اتواصل مع الادارة 🔑\n\n<@1315014140804206636> <@1320194211978543114>`, allowedMentions: { repliedUser: false, parse: ['users'] } });
        return;
    }

    // 3. Social media unban requests (not our service)
    const socialMediaKeywords = ['فك حظر تيك توك', 'فك حظر سناب', 'فك حظر انستقرام', 'فك حظر انستا', 'فك حظر فيسبوك', 'فك حظر تويتر', 'فك حضر تيك توك', 'فك حضر سناب', 'فك حضر انستقرام', 'فك حضر فيسبوك', 'فك حضر ip', 'فك حظر ip', 'انبان سناب', 'انبان تيك توك', 'انبان انستا', 'حظر سوشل', 'حظر حسابي سناب', 'حظر حسابي تيك', 'حظر حسابي انستا', 'فك بان سناب', 'فك بان تيك', 'فك بان انستا', 'فك بان فيس'];
    if (socialMediaKeywords.some(kw => msgLower.includes(kw))) {
        await message.reply({ content: `يا طويل العمر المتجر متخصص فك باند **العاب فقط** لا غير 🎮\n\nما نقدر نساعدك بفك حظر حسابات السوشل ميديا، معذرة.`, allowedMentions: { repliedUser: false } });
        return;
    }

    // 4. Admin mention + "come help" (someone tagging admins asking for help)
    const adminMentioned = msgRaw.includes('1315014140804206636') || msgRaw.includes('1320194211978543114');
    const callKeywords = ['تعال', 'موجود', 'ابيكم', 'ابيك', 'احد يسحبني', 'سحبوني', 'وينكم', 'وينك', 'ردوا', 'رد علي', 'فينك', 'فينكم'];
    if (adminMentioned && callKeywords.some(kw => msgLower.includes(kw))) {
        await message.reply({ content: `حياك تفضل بالانتظار في هذا الروم <#1396967239948701859> حتى يسحبوك ويردون عليك 🙏\n\n<@1315014140804206636> <@1320194211978543114>`, allowedMentions: { repliedUser: false, parse: ['users'] } });
        return;
    }


    if (msgLower === '!توافق' || msgLower === '!فحص' || msgLower === '!منتج' || msgLower === '!check') {
        const calcEmbed = new EmbedBuilder()
            .setTitle('🎯 حاسبة التوافق الذكية - T3N')
            .setDescription(
                '**أهلاً! خلني أساعدك تلقى المنتج المثالي لك!** 🤖\n\n' +
                '🎮 **اختر اللعبة اللي متبند فيها:**\n\n' +
                'بعد ما تختار، بعطيك:\n' +
                '• ✅ المنتج المناسب بالضبط\n' +
                '• 💰 السعر\n' +
                '• 📋 المتطلبات\n' +
                '• 🔗 رابط الشراء المباشر'
            )
            .setColor(0x5865F2)
            .setFooter({ text: 'T3N Store - Smart Compatibility Calculator' })
            .setTimestamp();

        const gameRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('calc_fortnite')
                    .setLabel('🎮 فورتنايت')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('calc_cod')
                    .setLabel('🔫 كود (CoD)')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('calc_valorant')
                    .setLabel('🎯 فالورانت')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('calc_apex')
                    .setLabel('🦊 أبكس')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('calc_other')
                    .setLabel('🎲 لعبة ثانية')
                    .setStyle(ButtonStyle.Secondary),
            );

        await message.reply({ embeds: [calcEmbed], components: [gameRow] });
        return;
    }

    try {
        console.log(`📩[START] Processing message from ${message.author.tag} `);
        await message.channel.sendTyping();

        let cleanContent = message.content.replace(new RegExp(`< @! ? ${client.user?.id}> `, 'g'), '').trim();
        if (!cleanContent && message.attachments.size === 0) cleanContent = "صِف لي ما في الصورة";

        console.log(`🔍 Cleaned: "${cleanContent}"`);

        // --- CHECK IF USER HAS CUSTOMER ROLE (Smart Context) ---
        let isExistingCustomer = false;
        if (message.member) {
            isExistingCustomer = message.member.roles.cache.has(CUSTOMER_ROLE_ID);
        }

        // --- UPDATE USER PROFILE (Feature #121) ---
        const userProfile = updateUserProfile(message.author.id, message.author.username, isExistingCustomer, cleanContent);

        // PREPARE MESSAGES ARRAY FOR OPENAI
        let aiMessages = [
            { role: "system", content: SYSTEM_INSTRUCTION },
        ];

        // Add context about the user
        if (isExistingCustomer) {
            aiMessages.push({
                role: "system",
                content: `🟢[حالة المستخدم]: هذا المستخدم "${message.author.username}" عنده رتبة "عميل" في السيرفر — يعني هو مشتري سابق وموثوق ✅.
                المطلوب منك:
    1. رحب فيه بحرارة: "يا هلا والله بعميلنا الغالي! 😍"
    2. اسأله مباشرة كيف تقدر تساعده: "بشر عسى أمورك طيبة؟ واجهتك أي مشكلة في السبوفر؟"
    3. إذا اشتكى من مشكلة: ابدأ في حلها فوراً(خطوة بخطوة) ولا تطلب منه أي إثبات أو فاتورة نهائياً.
                4. خلك صبور جداً معه ومساعد لأبعد حد.`
            });
        } else {
            aiMessages.push({
                role: "system",
                content: `🔴[حالة المستخدم]: هذا المستخدم "${message.author.username}" ما عنده رتبة "عميل" — يعني هو زبون جديد ما اشترى بعد.هدفك تقنعه يشتري.كن حماسي واعرض المنتجات بشكل جذاب.إذا قال "شريت" أو "دفعت" اطلب منه صورة الفاتورة فوراً.`
            });
        }

        // --- INJECT LONG-TERM MEMORY (Feature #121) ---
        if (userProfile && userProfile.totalMessages > 1) {
            let memoryContext = `📋[ذاكرة طويلة المدى - هذا العميل تكلمنا معه قبل]: \n`;
            memoryContext += `- الاسم: ${userProfile.username} \n`;
            memoryContext += `- أول ظهور: ${new Date(userProfile.firstSeen).toLocaleDateString('ar-SA')} \n`;
            memoryContext += `- عدد رسائله الكلي: ${userProfile.totalMessages} \n`;

            if (userProfile.purchaseHistory.length > 0) {
                memoryContext += `- سجل الشراء: ${userProfile.purchaseHistory.slice(-3).join(' | ')} \n`;
            }
            if (userProfile.issueHistory.length > 0) {
                memoryContext += `- مشاكل سابقة: ${userProfile.issueHistory.slice(-3).join(' | ')} \n`;
            }
            if (userProfile.recentTopics.length > 0) {
                memoryContext += `- مواضيع اهتمامه: ${userProfile.recentTopics.join(', ')} \n`;
            }

            memoryContext += `\nاستخدم هذي المعلومات عشان تخدمه بشكل شخصي.مثلاً: "أشوفك سألت عن فورتنايت قبل" أو "مرحبا مرة ثانية!"`;

            aiMessages.push({ role: "system", content: memoryContext });
        }

        // --- INJECT CONVERSATION SUMMARY (Feature #62) ---
        const convSummary = getUserConversationSummary(message.author.id);
        if (convSummary) {
            aiMessages.push({
                role: "system",
                content: `📝[ملخص محادثات سابقة مع هذا العميل]: \n${convSummary} \n\nاستخدم هذا السياق لتقديم خدمة أفضل.لا تكرر نفس المعلومات إلا إذا طلبها.`
            });
        }

        // --- INJECT LEARNED KNOWLEDGE (Feature #130) ---
        const relevantKnowledge = findRelevantKnowledge(cleanContent);
        if (relevantKnowledge.length > 0) {
            const knowledgeText = relevantKnowledge.map(k =>
                `- الموضوع "${k.pattern}"(سُئل ${k.count} مرة)`
            ).join('\n');
            aiMessages.push({
                role: "system",
                content: `📚[معلومات من قاعدة المعرفة المكتسبة - المواضيع الشائعة]: \n${knowledgeText} \nهذي المواضيع يسألون عنها كثير، رد بثقة وبالتفصيل.`
            });
        }

        // --- Add USER-based history (Feature #180: Multi-conversation tracking) ---
        const userHistoryKey = message.author.id; // Per-user, not per-channel!
        const history = conversationHistory.get(userHistoryKey) || [];
        aiMessages.push(...history);

        let userContent = [];
        let hasImage = false;

        if (cleanContent) {
            userContent.push({ type: "text", text: cleanContent });
        }

        if (message.attachments.size > 0) {
            const attachment = message.attachments.first();
            const mimeType = attachment.contentType;

            if (mimeType && (mimeType.startsWith('image/') || mimeType.startsWith('video/'))) {
                hasImage = true;
                console.log(`🎬 Processing ${mimeType.split('/')[0]} attachment...`);

                const response = await fetch(attachment.url);
                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const base64Data = buffer.toString("base64");
                const dataURL = `data:${mimeType};base64,${base64Data}`;

                userContent.push({
                    type: mimeType.startsWith('image/') ? "image_url" : "input_file",
                    [mimeType.startsWith('image/') ? "image_url" : "input_file"]: {
                        url: dataURL
                    }
                });
                console.log(`✅ ${mimeType.split('/')[0]} processed!`);
            }
        }

        if (hasImage) {
            aiMessages.push({
                role: "system",
                content: "🔴 **CRITICAL INSTRUCTION FOR IMAGE ANALYSIS:**\n" +
                    "1. If the image is a **'VERIFIED CUSTOMER CERTIFICATE'** (شهادة عميل معتمد) or looks like a T3N Store certificate, you must **REJECT** it. Output the keyword `###CERTIFICATE_REJECTED###`.\n" +
                    "2. Only output `###VERIFIED_CUSTOMER###` if the image is a **VALID PAYMENT RECEIPT** (Bank transfer, Salla receipt, PayPal, STC Pay, etc.).\n" +
                    "3. Do not accept certificates as proof of purchase."
            });
        }

        aiMessages.push({ role: "user", content: userContent });

        let text = "";
        try {
            const completion = await openai.chat.completions.create({
                model: "google/gemini-2.0-flash-001",
                messages: aiMessages,
                max_tokens: 1500, // Limit tokens to save credits (Fix 402 Error)
            });
            text = completion.choices[0].message.content;
        } catch (genError) {
            console.error("OpenAI/OpenRouter Error:", genError);
            if (genError.message && genError.message.includes("429")) {
                console.log("⚠️ Quota limit hit (OpenRouter), retrying in 4s...");
                await new Promise(resolve => setTimeout(resolve, 4000));

                const completionRetry = await openai.chat.completions.create({
                    model: "google/gemini-2.0-flash-001",
                    messages: aiMessages,
                    max_tokens: 1500, // Limit tokens
                });
                text = completionRetry.choices[0].message.content;
            } else {
                throw genError;
            }
        }

        // --- VERIFIED CUSTOMER LOGIC ---
        // 1. Rejected Certificate (Feature #UserRequest)
        if (text.includes("###CERTIFICATE_REJECTED###")) {
            await message.reply({
                content: "⛔ **هذي شهادة شكر وليست إيصال دفع!** 😅\n\nعشان تاخذ الرتبة وتوثق شراك، لازم ترسل صورة **إيصال التحويل** أو **رسالة الدفع** (من البنك أو سلة).\nالشهادة هذي للزينة بس! 📜✨"
            });
            return;
        }

        // 2. Valid Receipt
        if (text.includes("###VERIFIED_CUSTOMER###") && hasImage) {
            if (!message.guild) {
                text = "✅ **تم التحقق من الفاتورة!**\nعذراً، لا أستطيع إعطاء الرتبة هنا في الخاص. يرجى إرسال الصورة في السيرفر أو التذكرة للحصول على الرتبة تلقائياً.";
            } else {
                try {
                    const role = message.guild.roles.cache.get(CUSTOMER_ROLE_ID);
                    if (role) {
                        await message.member.roles.add(role);
                        await message.reply({
                            content: `✅ ** تم تأكيد عملية الشراء! مبروك يا وحش ** 🎉\nتفضل، تم تفعيل رتبة العميل لك.\n\n📂 ** رومات الشرح والتحميل:**\nhttps://discord.com/channels/1396959491786018826/1462562450502320170\nhttps://discord.com/channels/1396959491786018826/1462608106570780722\n\n⭐ **لا تنسى تقيمنا ياشيخ:**\nhttps://mtjr.at/UB3_WiH045\n(اكتب الخدمة اللي تشوفها يا قلب)\n\n📸 **وبعد فك الباند قيم هنا بصورة ومنشني وكلام عسل زيك:**\nhttps://discord.com/channels/1396959491786018826/1397221014215331891`
                        });
                        console.log(`✅ Role given to ${message.author.tag}`);

                        // --- GENERATE CUSTOMER CERTIFICATE (Feature #282) ---
                        try {
                            const certNumber = String(Date.now()).slice(-6);
                            const logoFile = path.join(__dirname, 'assets', 'logo.png');
                            const certBuffer = await generateCertificate({
                                customerName: message.author.username,
                                customerId: message.author.id,
                                productName: 'T3N Spoofer',
                                ticketName: message.channel.name || 'Direct',
                                certificateNumber: certNumber,
                                logoPath: fs.existsSync(logoFile) ? logoFile : null,
                            });

                            // Send certificate as DM
                            const { AttachmentBuilder } = require('discord.js');
                            const certAttachment = new AttachmentBuilder(certBuffer, { name: `T3N-Certificate-${certNumber}.png` });

                            await message.author.send({
                                content: `📜 **شهادة عميل معتمد — T3N Store**\n\nمبروك يا بطل! 🎉 هذي شهادتك الرسمية كعميل معتمد في متجر T3N.\nاحتفظ فيها وشاركها مع ربعك! 💎\n\n🔢 رقم الشهادة: **#T3N-${certNumber}**`,
                                files: [certAttachment]
                            });
                            console.log(`📜 Certificate sent to ${message.author.tag} (#T3N-${certNumber})`);
                        } catch (certError) {
                            console.error('Certificate generation error:', certError.message);
                            // Non-critical: don't block the flow if certificate fails
                        }

                        logToWebhook(message.author, "[Receipt Verified]", "Role Given + Links Sent + Certificate");
                        return;
                    } else {
                        console.error("❌ Role ID not found in cache!");
                        text = "تم التحقق من الفاتورة، لكن لم أجد الرتبة في السيرفر. (يرجى التأكد من الـ Role ID).";
                    }
                } catch (roleError) {
                    console.error("❌ Error giving role:", roleError.message);
                    text = "تم التحقق، لكن حدث خطأ أثناء إعطاء الرتبة.\n⚠️ **تأكد من وضع رتبة البوت فوق رتبة العميل في إعدادات السيرفر!**";
                }
            }
        }

        if (!text) text = "عذراً، لم أستطع توليد رد.";

        // --- HANDLE VOICE RESPONSE ---
        let voiceFile = null;
        if (text.includes("###SEND_VOICE###")) {
            console.log("🎙️ Generating voice message...");
            const cleanTextForVoice = text.replace("###SEND_VOICE###", "").replace(/[*_#]/g, "").substring(0, 200);
            const url = googleTTS.getAudioUrl(cleanTextForVoice, {
                lang: 'ar',
                slow: false,
                host: 'https://translate.google.com',
            });
            text = text.replace("###SEND_VOICE###", "").trim();
        }



        // --- HANDLE ADMIN ALERT ---
        if (text.includes("###ADMIN_ALERT###")) {
            console.log("🚨 Admin alert triggered!");
            const adminChannel = await client.channels.fetch(ADMIN_LOG_CHANNEL_ID);
            if (adminChannel) {
                const alertEmbed = new EmbedBuilder()
                    .setTitle('🚨 مشلوط في الصندقه يحتاج تدخل بشري')
                    .setColor(0xFF0000)
                    .addFields(
                        { name: '👤 المستخدم', value: `${message.author.tag} (${message.author.id})` },
                        { name: '📍 الروم / التكت', value: `<#${message.channel.id}>` },
                        { name: '💬 المحتوى', value: cleanContent || "بدون نص" }
                    )
                    .setTimestamp();
                await adminChannel.send({
                    content: `<@${DISCLAIMER_USER_ID}> <@${SECOND_ADMIN_ID}> فيه عميل "مشلوط" يحتاج فزعتكم هنا! تكت: <#${message.channel.id}>`,
                    embeds: [alertEmbed]
                });
            }
            text = text.replace("###ADMIN_ALERT###", "").trim();
        }

        // --- SEND RESPONSE ---
        if (text.length > 2000) {
            const chunks = text.match(/[\s\S]{1,2000}/g) || [];
            for (const chunk of chunks) {
                await message.reply({ content: chunk, allowedMentions: { repliedUser: false } });
            }
        } else {
            const replyOptions = { content: text };
            if (voiceFile) {
                replyOptions.files = [{ attachment: voiceFile, name: 'T3N_Voice.mp3' }];
            }
            replyOptions.allowedMentions = { repliedUser: false }; // Disable Ping
            await message.reply(replyOptions);
        }

        // --- UPDATE USER HISTORY (Feature #180: Per-user tracking) ---
        // userHistoryKey already declared above
        const currentHistory = conversationHistory.get(userHistoryKey) || [];

        // Add current exchange
        currentHistory.push({ role: "user", content: cleanContent });
        currentHistory.push({ role: "assistant", content: text });

        // Smart compression: if history is too long, compress oldest messages into a summary
        if (currentHistory.length > MAX_HISTORY) {
            // Take the oldest messages and compress them into a summary
            const oldMessages = currentHistory.slice(0, currentHistory.length - MAX_HISTORY);
            const recentMessages = currentHistory.slice(-MAX_HISTORY);

            // Build a compressed summary of old messages
            const oldUserMsgs = oldMessages.filter(m => m.role === 'user').map(m => {
                const content = typeof m.content === 'string' ? m.content : 'رسالة';
                return content.substring(0, 60);
            });

            if (oldUserMsgs.length > 0) {
                const compressionNote = {
                    role: "system",
                    content: `📎 [ملخص مضغوط لرسائل سابقة من هذا العميل]: ${oldUserMsgs.slice(-MAX_COMPRESSED_SUMMARY).join(' | ')}`
                };
                conversationHistory.set(userHistoryKey, [compressionNote, ...recentMessages]);
            } else {
                conversationHistory.set(userHistoryKey, recentMessages);
            }
        } else {
            conversationHistory.set(userHistoryKey, currentHistory);
        }

        // --- LOG CONVERSATION (Feature #62) ---
        logConversation(message.author.id, message.channel.name || 'DM', 'user', cleanContent);
        logConversation(message.author.id, message.channel.name || 'DM', 'assistant', text);

        // --- UPDATE KNOWLEDGE BASE (Feature #130) ---
        const category = isTicket ? 'تذكرة' : (isDM ? 'خاص' : 'عام');
        updateKnowledge(cleanContent, text, category);

        logToWebhook(message.author, cleanContent + (hasImage ? " [📸 Image]" : ""), text);

    } catch (error) {
        console.error("❌ Error:", error.message);

        if (error.message.includes("429")) {
            await message.reply(`⏳ ضغط عالي (429). جرب بعد قليل.\n التفاصيل: ${error.message}`);
        } else {
            await message.reply(`❌ خطأ تقني:\n\`${error.message}\``);
        }
    }
});

// --- KEEP ALIVE SERVER ---
app.get('/', (req, res) => res.send('Bot is Online! 🤖🚀'));
app.get('/ping', (req, res) => res.status(200).send('pong'));
app.listen(port, () => console.log(`🌍 Server is running on port ${port}`));

// =============================================
// === VOUCH TO TIKTOK BRIDGE (WITH APPROVAL) ===
// =============================================
client.on('messageCreate', async (message) => {
    if (message.channel.id !== VOUCH_CHANNEL_ID) return;
    if (message.author.bot) return;

    if (message.attachments.size > 0) {
        const image = message.attachments.first();
        if (image.contentType && image.contentType.startsWith('image/')) {
            console.log(`🌟 Review detected! Sending to approval channel...`);

            const approvalChannel = await client.channels.fetch(PUBLISH_APPROVAL_CHANNEL_ID);
            if (approvalChannel) {
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('publish_vouch')
                            .setLabel('✅ نـشـر (TikTok)')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('reject_vouch')
                            .setLabel('❌ رفـض')
                            .setStyle(ButtonStyle.Danger),
                    );

                const embed = new EmbedBuilder()
                    .setTitle('📽️ طلب نشر محتوى جديد')
                    .setDescription(`العميل: **${message.author.username}**\nالنص: ${message.content || "لا يوجد نص"}`)
                    .setImage(image.url)
                    .setColor(0x00AE86)
                    .setTimestamp();

                await approvalChannel.send({
                    content: "وصل تقييم جديد! هل ترغب بنشره في تيك توك؟",
                    embeds: [embed],
                    components: [row]
                });
            }
        }
    }
});

// =============================================
// === INTERACTION HANDLER (Buttons) ===
// =============================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    // --- PUBLISH VOUCH ---
    if (interaction.customId === 'publish_vouch') {
        await interaction.deferUpdate();

        const embed = interaction.message.embeds[0];
        const imageUrl = embed.image.url;

        const lines = embed.description.split('\n');
        const customerName = lines[0].replace('العميل: ', '').replace(/\*\*/g, '');
        const reviewText = lines[1] ? lines[1].replace('النص: ', '') : '';

        const marketingCaption = `🎬 تقييم جديد من عميل فخم! 🎬\n\n` +
            `👤 رأي البطل: ${customerName}\n` +
            `💬 "${reviewText}"\n\n` +
            `🔥 انضم لعائلة T3N Store اليوم! 🔥\n` +
            `👇 تلاقون الرابط في البايو 👇\n\n` +
            `💎 #T3N_Store #تقييمات #قيمرز #متجر #Shorts`;

        console.log("📤 Sending PREMIUM content to bridge...");
        const MAKE_WEBHOOK_URL = "https://hook.eu1.make.com/dgqt1rawyuoeze5f3ziebit9cv51m9c7";

        if (MAKE_WEBHOOK_URL !== "YOUR_MAKE_WEBHOOK_HERE") {
            try {
                await fetch(MAKE_WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imageUrl: imageUrl,
                        caption: marketingCaption,
                        storeName: "T3N Store",
                        status: "approved"
                    })
                });
                await interaction.editReply({ content: "✅ تم الإرسال إلى جسر النشر بنجاح!", components: [] });
            } catch (err) {
                await interaction.editReply({ content: "❌ فشل الإرسال للجسر التقني.", components: [] });
            }
        } else {
            await interaction.editReply({ content: "⚠️ لم يتم ربط Webhook النشر بعد.", components: [] });
        }
    }

    // --- REJECT VOUCH ---
    if (interaction.customId === 'reject_vouch') {
        await interaction.update({ content: "❌ تم رفض التقييم.", embeds: [], components: [] });
    }

    // Ticket interaction handlers removed

    // --- COMPATIBILITY CALCULATOR RESULTS (Feature #230) ---
    if (interaction.customId.startsWith('calc_')) {
        const gameType = interaction.customId.replace('calc_', '');

        const products = {
            fortnite: {
                emoji: '🎮',
                game: 'فورتنايت (Fortnite)',
                product: 'سبوفر فورتنايت',
                price: '49.99 ر.س',
                features: [
                    '✅ فك باند نهائي (بطولات + عادي)',
                    '✅ يدعم جميع المذربوردات',
                    '✅ استخدام مرة واحدة يكفي',
                    '✅ ضمان 100% أو تعويض',
                ],
                requirements: [
                    '💻 ويندوز 10 أو 11 (64-bit)',
                    '🔒 تعطيل الأنتي فايروس مؤقتاً',
                    '👑 تشغيل كمسؤول (Admin)',
                    '🔄 ريستارت بعد التطبيق',
                ],
                link: 'https://salla.sa/t3nn',
                color: 0xFFD700,
                note: '🔥 الأكثر مبيعاً! 87% من عملائنا اختاروه.',
            },
            cod: {
                emoji: '🔫',
                game: 'كول أوف ديوتي (CoD)',
                product: 'سبوفر بيرم',
                price: '35 ر.س',
                features: [
                    '✅ فك باند كود + ألعاب ثانية',
                    '✅ يدعم وورزون + مالتي',
                    '✅ استخدام مرة واحدة يكفي',
                    '✅ ضمان 100%',
                ],
                requirements: [
                    '💻 ويندوز 10 أو 11 (64-bit)',
                    '🔒 تعطيل الأنتي فايروس',
                    '👑 تشغيل كمسؤول (Admin)',
                    '🔄 ريستارت بعد التطبيق',
                ],
                link: 'https://salla.sa/t3nn',
                color: 0xFF6B35,
                note: '💪 يغطي كود وباقي الألعاب بنفس السعر!',
            },
            valorant: {
                emoji: '🎯',
                game: 'فالورانت (Valorant)',
                product: 'سبوفر بيرم',
                price: '35 ر.س',
                features: [
                    '✅ فك باند فالورانت نهائي',
                    '✅ يشتغل مع Vanguard Anti-Cheat',
                    '✅ استخدام مرة واحدة يكفي',
                    '✅ ضمان 100%',
                ],
                requirements: [
                    '💻 ويندوز 10 أو 11 (64-bit)',
                    '🔒 تعطيل الأنتي فايروس',
                    '⚙️ تعطيل Secure Boot من البايوس',
                    '🔄 ريستارت بعد التطبيق',
                ],
                link: 'https://salla.sa/t3nn',
                color: 0xFF4655,
                note: '🎯 متوافق 100% مع آخر تحديث فالورانت!',
            },
            apex: {
                emoji: '🦊',
                game: 'أبكس ليجندز (Apex Legends)',
                product: 'سبوفر بيرم',
                price: '35 ر.س',
                features: [
                    '✅ فك باند أبكس نهائي',
                    '✅ يدعم جميع الإصدارات',
                    '✅ استخدام مرة واحدة يكفي',
                    '✅ ضمان 100%',
                ],
                requirements: [
                    '💻 ويندوز 10 أو 11 (64-bit)',
                    '🔒 تعطيل الأنتي فايروس',
                    '👑 تشغيل كمسؤول (Admin)',
                    '🔄 ريستارت بعد التطبيق',
                ],
                link: 'https://salla.sa/t3nn',
                color: 0xDA292A,
                note: '🦊 يشتغل مع EAC Anti-Cheat بدون مشاكل!',
            },
            other: {
                emoji: '🎲',
                game: 'لعبة أخرى',
                product: 'سبوفر VIP',
                price: '200 ر.س',
                features: [
                    '✅ فك باند جميع الألعاب بدون استثناء',
                    '✅ مفتاح خاص فيك مدى الحياة',
                    '✅ كل ما تبندت تفك باندك بنفسك',
                    '✅ تحديثات مجانية مدى الحياة',
                    '✅ أولوية في الدعم الفني',
                ],
                requirements: [
                    '💻 ويندوز 10 أو 11 (64-bit)',
                    '🔒 تعطيل الأنتي فايروس',
                    '👑 تشغيل كمسؤول (Admin)',
                    '🔄 ريستارت بعد التطبيق',
                ],
                link: 'https://salla.sa/t3nn',
                color: 0x9B59B6,
                note: '💎 الخيار الأفضل لو تلعب أكثر من لعبة! استثمار مدى الحياة.',
            },
        };

        const p = products[gameType] || products.other;

        const resultEmbed = new EmbedBuilder()
            .setTitle(`${p.emoji} نتيجة التوافق — ${p.game}`)
            .setDescription(
                `**🏷️ المنتج المناسب لك:** ${p.product}\n` +
                `**💰 السعر:** ${p.price}\n\n` +
                `**📋 المميزات:**\n${p.features.join('\n')}\n\n` +
                `**⚙️ متطلبات جهازك:**\n${p.requirements.join('\n')}\n\n` +
                `📌 ${p.note}\n\n` +
                `🛒 **[اطلب الحين من هنا!](${p.link})**`
            )
            .setColor(p.color)
            .setFooter({ text: '✅ متوافق مع جهازك | T3N Smart Calculator' })
            .setTimestamp();

        const vipRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('calc_upgrade_vip')
                    .setLabel('💎 ترقية لـ VIP (200 ر.س - مدى الحياة)')
                    .setStyle(ButtonStyle.Success),
            );

        // Don't show VIP upgrade if already selected VIP
        if (gameType === 'other') {
            await interaction.update({ embeds: [resultEmbed], components: [] });
        } else {
            await interaction.update({ embeds: [resultEmbed], components: [vipRow] });
        }
    }

    // --- VIP UPGRADE from Calculator ---
    if (interaction.customId === 'calc_upgrade_vip') {
        const vipEmbed = new EmbedBuilder()
            .setTitle('💎 سبوفر VIP — مدى الحياة!')
            .setDescription(
                '**لماذا VIP أفضل خيار؟**\n\n' +
                '🔑 مفتاح خاص فيك — يشتغل على **جميع الألعاب**\n' +
                '♾️ استخدام **غير محدود** — كل ما تبندت تفك باندك\n' +
                '🔄 تحديثات **مجانية** مدى الحياة\n' +
                '⚡ أولوية في **الدعم الفني**\n' +
                '🛡️ ضمان **100%**\n\n' +
                '**💰 السعر: 200 ر.س (مرة واحدة فقط)**\n\n' +
                '📊 *حسبة بسيطة: لو تبندت 5 مرات بالسبوفر العادي = 175+ ر.س. بـ VIP تدفع مرة وحدة وتنتهي!*\n\n' +
                '🛒 **[اطلب VIP الحين!](https://salla.sa/t3nn)**'
            )
            .setColor(0xFFD700)
            .setFooter({ text: '💎 T3N VIP — Best Value' })
            .setTimestamp();

        await interaction.update({ embeds: [vipEmbed], components: [] });
    }

    // --- BOT PAUSE (Admin Control Panel) ---
    if (interaction.customId === 'bot_pause') {
        // Only admins can control
        if (interaction.user.id !== DISCLAIMER_USER_ID && interaction.user.id !== SECOND_ADMIN_ID) {
            return interaction.reply({ content: "❌ هذا الزر للأدمن فقط.", ephemeral: true });
        }

        isBotPaused = true;

        const pausedEmbed = new EmbedBuilder()
            .setTitle('🎛️ لوحة تحكم البوت الذكي - T3N')
            .setDescription(
                '**الحالة الحالية:** 🔴 متوقف مؤقتاً\n\n' +
                '📋 **الأوامر المتاحة:**\n' +
                '• **إيقاف مؤقت:** البوت يتوقف عن الرد على جميع الرسائل في كل الرومات.\n' +
                '• **تشغيل:** البوت يرجع يرد بشكل طبيعي.\n\n' +
                '⚠️ هذه اللوحة للأدمن فقط.'
            )
            .setColor(0xFF0000)
            .setFooter({ text: 'T3N Store - Bot Control Panel', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        const controlRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('bot_pause')
                    .setLabel('⏸️ إيقاف مؤقت')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('bot_resume')
                    .setLabel('▶️ تشغيل')
                    .setStyle(ButtonStyle.Success),
            );

        await interaction.update({ embeds: [pausedEmbed], components: [controlRow] });
        console.log(`⏸️ Bot PAUSED by ${interaction.user.tag}`);
    }

    // --- BOT RESUME (Admin Control Panel) ---
    if (interaction.customId === 'bot_resume') {
        if (interaction.user.id !== DISCLAIMER_USER_ID && interaction.user.id !== SECOND_ADMIN_ID) {
            return interaction.reply({ content: "❌ هذا الزر للأدمن فقط.", ephemeral: true });
        }

        isBotPaused = false;

        const activeEmbed = new EmbedBuilder()
            .setTitle('🎛️ لوحة تحكم البوت الذكي - T3N')
            .setDescription(
                '**الحالة الحالية:** 🟢 شغّال\n\n' +
                '📋 **الأوامر المتاحة:**\n' +
                '• **إيقاف مؤقت:** البوت يتوقف عن الرد على جميع الرسائل في كل الرومات.\n' +
                '• **تشغيل:** البوت يرجع يرد بشكل طبيعي.\n\n' +
                '⚠️ هذه اللوحة للأدمن فقط.'
            )
            .setColor(0x00FF00)
            .setFooter({ text: 'T3N Store - Bot Control Panel', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        const controlRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('bot_pause')
                    .setLabel('⏸️ إيقاف مؤقت')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('bot_resume')
                    .setLabel('▶️ تشغيل')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true),
            );

        await interaction.update({ embeds: [activeEmbed], components: [controlRow] });
        console.log(`▶️ Bot RESUMED by ${interaction.user.tag}`);
    }
});

client.login(DISCORD_BOT_TOKEN);
