// Quick test for Google Gemini API Key
const API_KEY = "AIzaSyDmREquX9D0pJIzAFM4Br4TXYTwkX7uELE";

async function testGemini() {
    console.log("Testing Google Gemini API Key...\n");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Say hello in Arabic" }] }] })
    });

    console.log("Status:", res.status, res.statusText);
    const data = await res.json();

    if (res.ok) {
        console.log("API Key WORKS!");
        console.log("Response:", data.candidates?.[0]?.content?.parts?.[0]?.text);
    } else {
        console.log("API Key FAILED!");
        console.log("Error:", JSON.stringify(data, null, 2));
    }
}

testGemini();
