import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const { image, mimeType } = req.body;
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `Analyze this fridge image. Return ONLY a valid JSON Array. 
        Format: [{"cuisine": "...", "name": "...", "image_keyword": "...", "ingredients": ["..."], "steps": ["..."]}]`;

        const imagePart = { inlineData: { data: image, mimeType: mimeType } };
        const result = await model.generateContent([prompt, imagePart]);
        const text = result.response.text();

        // --- INI CLEANUP NYA ---
        const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
        
        // Coba parsing
        const parsedRecipes = JSON.parse(cleanText);
        res.status(200).json({ success: true, recipes: parsedRecipes });

    } catch (error) {
        console.error("Error Detail:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}