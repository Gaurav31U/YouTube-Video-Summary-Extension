// imageGenerator.js

async function getSearchQueriesFromGemini(summary, apiKey) {
    if (!summary) {
        console.log("Summary is empty, skipping image query generation.");
        return [];
    }
    const finalApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

    const prompt = `
        Based on the following summary, generate up to 3 concise and effective Google Image Search queries that would find relevant, high-quality images to illustrate the key topics.
        GUIDELINES:
        1. Queries should be simple and direct.
        2. Respond with a valid JSON object with a single key "queries" containing an array of strings.
        3. If the summary is too generic, return an empty array for the "queries" key.
        SUMMARY:
        ---
        ${summary.substring(0, 4000)}
        ---
    `;

    try {
        const response = await fetch(finalApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ "contents": [{ "parts": [{ "text": prompt }] }] })
        });

        if (!response.ok) throw new Error(`Gemini API error for image queries: ${(await response.json()).error?.message}`);

        const data = await response.json();
        const jsonText = data.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedJson = JSON.parse(jsonText);

        // --- DEBUG LOGGING ---
        console.log("DEBUG: Gemini response for image queries:", parsedJson);
        
        if (parsedJson && Array.isArray(parsedJson.queries)) {
            return parsedJson.queries;
        }
        return [];
    } catch (e) {
        console.error("Failed to generate or parse image query JSON response:", e);
        return [];
    }
}


async function findImages(queries, apiKey, searchEngineId) {
    if (!queries || queries.length === 0) {
        console.log("No search queries provided, skipping image search.");
        return [];
    }
    const imageUrls = [];
    const CUSTOM_SEARCH_URL = "https://www.googleapis.com/customsearch/v1";

    const fetchPromises = queries.map(query => {
        const url = `${CUSTOM_SEARCH_URL}?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}&searchType=image&num=1`;
        return fetch(url).then(res => res.json());
    });

    const results = await Promise.all(fetchPromises);
    
    // --- DEBUG LOGGING ---
    console.log("DEBUG: Raw results from Custom Search API:", results);

    for (const data of results) {
        if (data.items && data.items.length > 0 && data.items[0].link) {
            imageUrls.push(data.items[0].link);
        } else {
             console.log("DEBUG: No image items found for a query. Response:", data);
        }
    }

    // --- DEBUG LOGGING ---
    console.log("DEBUG: Final list of image URLs found:", imageUrls);

    return imageUrls;
}