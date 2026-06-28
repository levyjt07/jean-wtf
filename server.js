const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS so your GitHub Pages frontend can communicate safely with Biznet
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

app.post('/api/analyze', async (req, res) => {
    try {
        const { image, mimeType } = req.body;

        if (!image || !mimeType) {
            return res.status(400).json({ error: 'Image data or MIME type is missing!' });
        }

        const model = genAI.getGenerativeModel({ 
            model: 'gemini-2.5-flash',
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `Analyze the contents of the refrigerator in this photo. Based on the available ingredients, provide 3 to 5 feasible recipe recommendations and group them by their respective cuisine type (e.g., "Indonesian Recipe", "Chinese Recipe", "Italian Recipe", "American Recipe", "Mexican Recipe").

You MUST return a valid JSON Array where each object contains "cuisine", "name", "image_keyword" (strictly provide 1 single lowercase English food category word, chosen ONLY from this list: "omelette", "stirfry", "pasta", "salad", "soup", "rice", "chicken"), "ingredients" (array of strings), and "steps" (array of strings). Follow this exact structural schema:
[
  {
    "cuisine": "Italian Recipe",
    "name": "Classic Creamy Carbonara",
    "image_keyword": "pasta",
    "ingredients": ["Pasta", "Eggs", "Garlic", "Cheese", "Black Pepper"],
    "steps": ["Boil the pasta in salted water until al dente.", "Whisk the eggs and cheese together in a bowl.", "Pan-fry the garlic, combine everything off the heat, and toss until creamy."]
  }
]`;

        const imagePart = {
            inlineData: { data: image, mimeType: mimeType },
        };
        
        const result = await model.generateContent([prompt, imagePart]);
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
            res.json({ success: true, recipes: parsedRecipes });
        } catch (jsonError) {
            res.status(500).json({ success: false, error: "AI returned invalid JSON formatting." });
        }

    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to process image or parse AI JSON layout.', details: error.message });
    }
});

// Serve static assets if any
app.use(express.static(__dirname));

app.listen(PORT, () => {
    console.log(`🚀 WTFridge? Engine running successfully on port ${PORT}`);
});