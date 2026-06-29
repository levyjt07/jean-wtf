const { GoogleGenerativeAI } = require('@google/generative-ai');

// Helper function for artificial delay (retry backoff)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = async (req, res) => {
    // 1. CORS Headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
    }

    try {
        const { image, mimeType } = req.body;

        if (!image || !mimeType) {
            return res.status(400).json({ success: false, error: 'Missing image data or MIME type.' });
        }

        const rawApiKey = process.env.GEMINI_API_KEY;
        if (!rawApiKey || rawApiKey.trim() === "" || rawApiKey === "undefined") {
            return res.status(500).json({ success: false, error: 'GEMINI_API_KEY is missing in environment variables.' });
        }

        const cleanApiKey = rawApiKey.trim().replace(/^["']|["']$/g, '');
        const genAI = new GoogleGenerativeAI(cleanApiKey);
        
        // Define primary model and ultra-stable backup model
        const modelsToTry = ['gemini-2.5-flash', 'gemini-1.5-flash'];
        let result;
        let lastError;

        const prompt = `Analyze the contents of the refrigerator in this photo. Based on the available ingredients, provide 3 to 5 feasible recipe recommendations and group them by their respective cuisine type (e.g., "Indonesian Recipe", "Western Dessert", "Japanese Recipe", "Beverage Corner").

        CRITICAL CONDITION: Only return an empty JSON array ([]) if the refrigerator is literally completely empty, containing absolutely no food, or contains only non-edible items. If there are visible food items, vegetables, fruits, condiments, or dairy beverages (such as milk, yogurt, juices, etc.), you MUST use your culinary creativity to suggest recipes, snacks, desserts, or simple beverages that can utilize them. Do not be overly restrictive.

        Return a valid JSON Array where each object contains "cuisine", "name", "image_keyword" (strictly provide 1 single lowercase English food category word, chosen ONLY from this list: "omelette", "stirfry", "pasta", "salad", "soup", "rice", "chicken", "dessert", "drink", "snack"), "ingredients" (array of strings), and "steps" (array of strings). Follow this exact structural schema:
        [
          {
            "cuisine": "Western Dessert",
            "name": "Classic Milk Pudding",
            "image_keyword": "dessert",
            "ingredients": ["Milk", "Sugar", "Agar-agar powder"],
            "steps": ["Mix milk, sugar, and agar-agar powder in a pot.", "Boil the mixture over medium heat while stirring continuously.", "Pour into molds and let it cool inside the fridge until set."]
          }
        ]`;

        const imagePart = {
            inlineData: { data: image, mimeType: mimeType },
        };

        // FAULT-TOLERANT EXECUTION LOOP
        for (let i = 0; i < modelsToTry.length; i++) {
            const currentModelName = modelsToTry[i];
            try {
                const model = genAI.getGenerativeModel({ 
                    model: currentModelName,
                    generationConfig: { responseMimeType: "application/json" }
                });
                
                // Execute API call
                result = await model.generateContent([prompt, imagePart]);
                
                // If it succeeds, break out of the loop completely
                if (result && result.response) {
                    break;
                }
            } catch (err) {
                lastError = err;
                // If we hit a 503 or overload on the primary model, wait 1.2 seconds and move to fallback
                if (i < modelsToTry.length - 1) {
                    await sleep(1200); 
                }
            }
        }

        // If both models completely failed, throw the final error
        if (!result || !result.response) {
            throw new Error(lastError ? lastError.message : 'All generation models are currently unresponsive.');
        }

        const response = await result.response;
        const text = response.text();

        let cleanText = text.trim();
        if (cleanText.startsWith("```json")) {
            cleanText = cleanText.replace(/^```json/, "").replace(/```$/, "");
        } else if (cleanText.startsWith("```")) {
            cleanText = cleanText.replace(/^```/, "").replace(/```$/, "");
        }

        try {
            const parsedRecipes = JSON.parse(cleanText.trim());
            return res.status(200).json({ success: true, recipes: parsedRecipes });
        } catch (jsonError) {
            return res.status(500).json({ 
                success: false, 
                error: "AI generated an invalid JSON format.",
                details: jsonError.message 
            });
        }

    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            error: `[Server Error]: ${error.message || 'Failed to analyze image.'}` 
        });
    }
};