const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async (req, res) => {
    // 1. Penanganan CORS Manual untuk Lingkungan Vercel Serverless
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Tangani request preflight OPTIONS dari browser
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Pastikan hanya menerima request POST
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method tidak diizinkan. Gunakan POST.' });
    }

    try {
        const { image, mimeType } = req.body;

        // Validasi payload request body
        if (!image || !mimeType) {
            return res.status(400).json({ success: false, error: 'Data gambar atau MIME type tidak ditemukan!' });
        }

        // Ambil API Key dari Environment Variable
        const rawApiKey = process.env.GEMINI_API_KEY;
        
        if (!rawApiKey || rawApiKey.trim() === "" || rawApiKey === "undefined") {
            return res.status(500).json({ 
                success: false, 
                error: '[DETEKSI] GEMINI_API_KEY terbaca kosong atau undefined di Vercel! Sila periksa kembali setelan di dashboard Vercel.' 
            });
        }

        // Bersihkan spasi atau tanda kutip otomatis
        const cleanApiKey = rawApiKey.trim().replace(/^["']|["']$/g, '');

        // Inisialisasi Google Gen AI
        const genAI = new GoogleGenerativeAI(cleanApiKey);
        
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-2.5-flash',
            generationConfig: { responseMimeType: "application/json" }
        });

        // PROMPT KALIBRASI BARU: Jauh lebih cerdas membedakan kulkas beneran kosong vs kulkas penuh susu/minuman
        const prompt = `Analyze the contents of the refrigerator in this photo. Based on the available ingredients, provide 3 to 5 feasible recipe recommendations and group them by their respective cuisine type (e.g., "Indonesian Recipe", "Western Dessert", "Japanese Recipe", "Beverage Corner").

        CRITICAL CONDITION: Only return an empty JSON array ([]) if the refrigerator is literally completely empty, containing absolutely no food, or contains only non-edible items (like empty plastic, medicine, or just plain water bottles). If there are visible food items, vegetables, fruits, condiments, or dairy beverages (such as milk, yogurt, juices, etc.), you MUST use your culinary creativity to suggest recipes, snacks, desserts, or simple beverages that can utilize them. Do not be overly restrictive.

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
        
        // Eksekusi pemrosesan ke SDK Google Gemini
        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text();

        // Pembersihan tag markdown ```json ... ```
        let cleanText = text.trim();
        if (cleanText.startsWith("```json")) {
            cleanText = cleanText.replace(/^```json/, "").replace(/```$/, "");
        } else if (cleanText.startsWith("```")) {
            cleanText = cleanText.replace(/^```/, "").replace(/```$/, "");
        }

        // Parsing hasil string menjadi JSON
        try {
            const parsedRecipes = JSON.parse(cleanText.trim());
            return res.status(200).json({ success: true, recipes: parsedRecipes });
        } catch (jsonError) {
            return res.status(500).json({ 
                success: false, 
                error: "AI menghasilkan format JSON yang tidak valid.",
                details: jsonError.message 
            });
        }

    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            error: `[Google SDK Error]: ${error.message || 'Gagal memproses gambar.'}` 
        });
    }
};