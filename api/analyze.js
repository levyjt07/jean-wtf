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

        // BERSIHKAN OTOMATIS: Hapus spasi dan tanda kutip (" atau ') yang tidak sengaja ikut ter-paste
        const cleanApiKey = rawApiKey.trim().replace(/^["']|["']$/g, '');

        // FITUR DETEKTOR MANDIRI: Mendukung format lama (AIzaSy) dan format baru (AQ.) secara resmi
        if (!cleanApiKey.startsWith("AIzaSy") && !cleanApiKey.startsWith("AQ.")) {
            return res.status(500).json({
                success: false,
                error: `[DETEKSI FORMAT SALAH] API Key harus diawali 'AIzaSy' atau 'AQ.', tetapi mendeteksi awalan: '${cleanApiKey.substring(0, 6)}...' (Panjang total: ${cleanApiKey.length} karakter). Sila periksa kembali di dashboard Vercel.`
            });
        }

        // Inisialisasi Google Gen AI menggunakan kunci yang sudah murni bersih
        const genAI = new GoogleGenerativeAI(cleanApiKey);
        
        // Mempertahankan model pilihan asli: gemini-2.5-flash
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-2.5-flash',
            generationConfig: { responseMimeType: "application/json" }
        });

        // Prompt optimal dengan validasi kulkas kosong (Anti-Halusinasi)
        const prompt = `Analyze the contents of the refrigerator in this photo. Based on the available ingredients, provide 3 to 5 feasible recipe recommendations and group them by their respective cuisine type (e.g., "Indonesian Recipe", "Chinese Recipe", "Italian Recipe", "American Recipe", "Mexican Recipe").

        CRITICAL CONDITION: If the refrigerator is completely empty, contains only water/expired items, or does not contain any viable cooking ingredients to make a proper meal, you MUST strictly return an empty JSON array: []. Do not hallucinate ingredients or invent recipes out of nothing.

        Otherwise, if ingredients are found, return a valid JSON Array where each object contains "cuisine", "name", "image_keyword" (strictly provide 1 single lowercase English food category word, chosen ONLY from this list: "omelette", "stirfry", "pasta", "salad", "soup", "rice", "chicken"), "ingredients" (array of strings), and "steps" (array of strings). Follow this exact structural schema:
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
        
        // Eksekusi pemrosesan ke SDK Google Gemini
        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text();

        // Pembersihan tag markdown ```json ... ``` seandainya model AI menyertakannya dalam output
        let cleanText = text.trim();
        if (cleanText.startsWith("```json")) {
            cleanText = cleanText.replace(/^```json/, "").replace(/```$/, "");
        } else if (cleanText.startsWith("```")) {
            cleanText = cleanText.replace(/^```/, "").replace(/```$/, "");
        }

        // Parsing hasil string bersih menjadi struktur JSON murni
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