const { GoogleGenerativeAI } = require("@google/generative-ai");
const GEMINI_API_KEY = "AIzaSyAYC2vZvEvt70UWQIEKgYpZKavnvXkT3uo";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function listModels() {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Dummy init to access client if needed, but we use genAI directly usually? 
        // Actually the SDK doesn't have a direct listModels on genAI instance in some versions?
        // Let's try to just run a generation with a "safe" model to test, or check documentation?
        // Being an agent, I can't check online docs easily.
        // I recall the Node SDK might not expose listModels easily in the main entry.
        // I'll try to use a known stable model name: "gemini-pro" is usually the safest bet if flash fails.
        // BUT the user wants image analysis. "gemini-pro-vision" is for images in v1.0. In 1.5 it's unified.

        console.log("Checking models...");
        // Let's try 'gemini-1.5-flash-001' which is a specific version.
        const model1 = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001" });
        const result = await model1.generateContent("Test");
        console.log("gemini-1.5-flash-001 works!");
    } catch (error) {
        console.error("Error with 001:", error.message);
    }
}

listModels();
