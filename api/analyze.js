const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async (req, res) => {
    // Konfigurasi CORS manual untuk Vercel Serverless
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method tidak diizinkan. Gunakan POST.' });
    }

    try {
        const { image, mimeType } = req.body;

        if (!image || !mimeType) {
            return res.status(400).json({ success: false, error: 'Data gambar atau MIME type tidak ditemukan!' });
        }

        // 1. Ambil API Key dari Environment Variable
        const rawApiKey = process.env.GEMINI_API_KEY;
        
        if (!rawApiKey || rawApiKey.trim() === "" || rawApiKey === "undefined") {
            return res.status(500).json({ 
                success: false, 
                error: '[DETEKSI] GEMINI_API_KEY terbaca kosong atau undefined di Vercel!' 
            });
        }

        // 2. BERSIHKAN OTOMATIS: Hapus spasi dan tanda kutip (" atau ') yang tidak sengaja ikut ter-paste
        const cleanApiKey = rawApiKey.trim().replace(/^["']|["']$/g, '');

        // 3. FITUR DETEKTOR MANDIRI: Cek apakah format kuncinya sudah benar diawali AIzaSy
        if (!cleanApiKey.startsWith("AIzaSy")) {
            return res.status(500).json({
                success: false,
                error: `[DETEKSI FORMAT SALAH] API Key di Vercel terdeteksi rusak/salah paste! Google API Key harusnya diawali 'AIzaSy', tetapi sistem Vercel membaca awalan kuncimu sebagai: '${cleanApiKey.substring(0, 6)}...' (Panjang total: ${cleanApiKey.length} karakter). Sila hapus dan paste ulang dengan benar di dashboard Vercel.`
            });
        }

        // Inisialisasi Google Gen AI menggunakan kunci yang sudah murni bersih
        const genAI = new GoogleGenerativeAI(cleanApiKey);
        
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