const fs = require('fs');
const path = 'index.js';
let content = fs.readFileSync(path, 'utf8');

// Find markers using simpler search
const startMarker = 'const SYSTEM_INSTRUCTION = `';
const endMarker = '`;\r\n\r\n// --- WEBHOOK SETUP ---';

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
    console.log("Could not find markers! startIdx:", startIdx, "endIdx:", endIdx);
    // Try without \r
    const endMarker2 = '`;\n\n// --- WEBHOOK SETUP ---';
    const endIdx2 = content.indexOf(endMarker2);
    console.log("Alt endIdx:", endIdx2);
    process.exit(1);
}

const before = content.substring(0, startIdx);
const after = content.substring(endIdx + 3); // skip the `;\r\n part, keep \r\n// --- WEBHOOK

const newPrompt = `const SYSTEM_INSTRUCTION = \`أنت "مساعد T3N" بوت دعم فني ومبيعات لمتجر T3N (سبوفر/فك باند ألعاب). اللهجة سعودية عامية مختصرة. ممنوع إيموجي كثير.
المنتجات: فورتنايت 49.99 ر.س (مرة)، بيرم 35 ر.س (كود/فالو/ابكس مرة)، VIP 200 ر.س (مدى الحياة كل الألعاب)، دعم خاص 35 ر.س. المتجر: https://salla.sa/t3nn
[عميل سابق] ساعد فوراً بدون فاتورة. [زبون جديد] اقنعه واعرض الأسعار.
قال بكم → اعطه الأسعار. قال شريت → اطلب صورة الفاتورة. فاتورة T3N صحيحة → ###VERIFIED_CUSTOMER### شهادة عميل → ###CERTIFICATE_REJECTED### سوشل ميديا → "متخصصين فك باند ألعاب فقط"
FAQ: ضمان مضمون 100%. فورمات ما يحتاج إلا لو ما زبط. شاشة زرقاء/SSL → حمل WARP. Key Invalid → تأكد من النسخ. DLL → حمل VC++. Access Denied → شغله كمسؤول.
مشكلة كتابة/تعال روم → "حياك: https://discord.com/channels/1396959491786018826/1396967239948701859 <@1315014140804206636> <@1320194211978543114>"
أبي مساعدة/روم → "https://salla.sa/t3nn/jgBZWje (35 ريال)"
وين أقيم → "https://discord.com/channels/1396959491786018826/1397221014215331891"
الكي مو شغال/رست key → "ابشر ثواني اتواصل مع الادارة" + ###ADMIN_ALERT###
خطوات السبوفر (لو طلب فقط): فك الضغط، مجلد كلين شغل الملفات، شغل spoofer t3n كمسؤول، الصق المفتاح، OK، Start journey، علامة الدرع فعل الخيارات واضغط EXECUTE، انتظر LOGS، الصاروخ START SPOOF اختر اللعبة وسوي ريستارت. حساب جديد: https://discord.com/channels/1396959491786018826/1470176763387576490
غضبان/مشكلة ما تنحل → ###ADMIN_ALERT### | طلب صوت → ###SEND_VOICE###\`;\r\n`;

content = before + newPrompt + after;

// Fix model references - change 70b to 8b-instant for text
content = content.replace(/model: "llama-3\.3-70b-versatile"/g, 'model: "llama-3.1-8b-instant"');

// Fix image handling - use vision model for images
const oldImg = `        // Groq only accepts string content (no vision/image support)\r\n        // Convert userContent array to plain string for compatibility\r\n        let finalContent;\r\n        if (hasImage) {\r\n            // Extract text parts only, ignore images\r\n            const textParts = userContent.filter(c => c.type === "text").map(c => c.text);\r\n            finalContent = (textParts.join(" ") + " [المستخدم أرسل صورة - لا يمكن تحليلها حالياً]").trim();\r\n        } else if (Array.isArray(userContent)) {\r\n            finalContent = userContent.filter(c => c.type === "text").map(c => c.text).join(" ");\r\n        } else {\r\n            finalContent = userContent;\r\n        }\r\n\r\n        aiMessages.push({ role: "user", content: finalContent });\r\n\r\n        let text = "";\r\n        const MAX_RETRIES = 3;\r\n        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {\r\n            try {\r\n                const completion = await openai.chat.completions.create({\r\n                    model: "llama-3.1-8b-instant",`;

const newImg = `        // Smart model selection: Vision for images, Text for chat\r\n        let selectedModel;\r\n        if (hasImage) {\r\n            selectedModel = "meta-llama/llama-4-scout-17b-16e-instruct";\r\n            aiMessages.push({ role: "system", content: "تعليمات: فاتورة T3N صحيحة → ###VERIFIED_CUSTOMER### واذكر التفاصيل. شهادة عميل → ###CERTIFICATE_REJECTED###. صورة ثانية → وصفها. رد بالعامية." });\r\n            aiMessages.push({ role: "user", content: userContent });\r\n        } else {\r\n            selectedModel = "llama-3.1-8b-instant";\r\n            let finalContent;\r\n            if (Array.isArray(userContent)) {\r\n                finalContent = userContent.filter(c => c.type === "text").map(c => c.text).join(" ");\r\n            } else {\r\n                finalContent = userContent;\r\n            }\r\n            aiMessages.push({ role: "user", content: finalContent });\r\n        }\r\n\r\n        let text = "";\r\n        const MAX_RETRIES = 3;\r\n        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {\r\n            try {\r\n                const completion = await openai.chat.completions.create({\r\n                    model: selectedModel,`;

if (content.includes(oldImg)) {
    content = content.replace(oldImg, newImg);
    console.log("✅ Image handling updated!");
} else {
    console.log("⚠️ Image handling pattern not found, will try alt");
}

// Reduce MAX_HISTORY
content = content.replace('const MAX_HISTORY = 6;', 'const MAX_HISTORY = 4;');

// Remove heavy system injections to save tokens
// Remove conversation summary (saves ~500 tokens per request)
content = content.replace(/        \/\/ --- INJECT CONVERSATION SUMMARY[\s\S]*?aiMessages\.push\(\{ role: "system", content: `📝\[ملخص[\s\S]*?\}\r?\n/g, '');

// Remove learned knowledge (saves ~300 tokens per request)  
content = content.replace(/        \/\/ --- INJECT LEARNED KNOWLEDGE[\s\S]*?aiMessages\.push\(\{\r?\n[\s\S]*?\}\);\r?\n        \}\r?\n/g, '');

fs.writeFileSync(path, content, 'utf8');
console.log("✅ File updated successfully!");
console.log("New file size:", content.length, "bytes");
