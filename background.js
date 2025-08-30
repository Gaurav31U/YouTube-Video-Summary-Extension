// background.js

// Import the required scripts
importScripts('lib/pako.min.js', 'imageGenerator.js');

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "generateNotes") {
        startNoteGeneration(
            request.transcript,
            request.videoTitle,
            request.documentId,
            request.summaryMode,
            request.downloadImages
        );
    }
    return true; // Indicates an asynchronous response
});

/**
 * The main function that orchestrates the entire note generation process.
 */
async function startNoteGeneration(transcript, videoTitle, documentId, summaryMode, downloadImages) {
    try {
        sendStatusUpdate("Authenticating user...", "black");
        const docToken = await getAuthToken();
        const { apiKey, searchEngineId } = await chrome.storage.local.get(['apiKey', 'searchEngineId']);
        if (!apiKey) throw new Error("API Key is not set.");
        if (downloadImages && !searchEngineId) throw new Error("Search Engine ID is required for downloading images.");

        let docId = documentId;
        if (docId) {
            sendStatusUpdate("Using existing Google Doc...", "black");
        } else {
            sendStatusUpdate("Creating new Google Doc...", "black");
            const doc = await createGoogleDoc(docToken, `Notes for: ${videoTitle}`);
            docId = doc.documentId;
        }

        // --- Step 1: Generate the complete summary text ---
        let fullSummary = "";
        if (summaryMode === 'detailed') {
            sendStatusUpdate("Generating detailed summary...", "black");
            const result = await getGeminiResponseDetailed(transcript, videoTitle, apiKey);
            fullSummary = result.summary;
        } else { // 'chunked' mode
            const chunks = chunkTranscript(transcript, 5000);
            let summaryParts = [];
            for (let i = 0; i < chunks.length; i++) {
                sendStatusUpdate(`Summarizing part ${i + 1} of ${chunks.length}...`, "black");
                const summaryChunk = await getGeminiResponseForChunk(chunks[i], videoTitle, apiKey, i === 0, i === chunks.length - 1);
                summaryParts.push(summaryChunk);
            }
            fullSummary = summaryParts.join('\n\n');
        }
        console.log("AI summary generated successfully.");

        // --- Step 2: Add ONLY the text content to the Google Doc ---
        sendStatusUpdate("Adding notes to Google Doc...", "black");
        await addContentToDoc(docToken, docId, videoTitle, fullSummary);
        console.log("Finished adding text to the document.");

        // --- Step 3: Conditionally find and download images ---
        if (downloadImages && fullSummary) {
            sendStatusUpdate("Generating image queries...", "black");
            const queries = await getSearchQueriesFromGemini(fullSummary, apiKey);
            if (queries && queries.length > 0) {
                sendStatusUpdate(`Searching for ${queries.length} images...`, "black");
                const imageUrls = await findImages(queries, apiKey, searchEngineId);
                if (imageUrls && imageUrls.length > 0) {
                    sendStatusUpdate(`Downloading ${imageUrls.length} images...`, "black");
                    await downloadImagesAsFiles(imageUrls, videoTitle);
                }
            }
        }
        
        sendStatusUpdate(`Success! Opening Google Doc...`, "green");
        chrome.tabs.create({ url: `https://docs.google.com/document/d/${docId}/edit` });

    } catch (error) {
        console.error("A critical error occurred:", error);
        sendStatusUpdate(`Error: ${error.message}`, "red");
    }
}

/**
 * Uses the chrome.downloads API to save image files locally.
 */
async function downloadImagesAsFiles(urls, videoTitle) {
    const safeTitle = videoTitle.replace(/[\\?%*:"|<>]/g, '-').slice(0, 50);
    urls.forEach((url, index) => {
        try {
            const fileExtensionMatch = url.match(/\.(jpg|jpeg|png|gif|webp)/i);
            const fileExtension = fileExtensionMatch ? fileExtensionMatch[1] : 'jpg';
            const filename = `notes/${safeTitle}_image_${index + 1}.${fileExtension}`;
            console.log(`Downloading ${url} to ${filename}`);
            chrome.downloads.download({ url, filename, saveAs: false });
        } catch (e) {
            console.error(`Failed to download URL: ${url}`, e);
        }
    });
}

// ========================================================
// AI MODEL FUNCTIONS
// ========================================================
async function getGeminiResponseDetailed(transcript, videoTitle, apiKey) {
    const finalApiUrl = `${GEMINI_API_URL}?key=${apiKey}`;
    const prompt = `Your task is to create a comprehensive summary of a piece of content. Do not use words like "video" or "speaker".
        GUIDELINES:
        - Preserve all key details and conclusions.
        - Use markdown formatting.
        - Output a valid JSON object with ONE key: "summary". The value is the markdown text.
        Content to analyze: ---
        ${transcript.substring(0, 100000)}
        ---`;
    const response = await fetch(finalApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ "contents": [{ "parts": [{ "text": prompt }] }], "generationConfig": { "maxOutputTokens": 8192 }})
    });
    if (!response.ok) throw new Error(`Gemini API error: ${(await response.json()).error?.message}`);
    const data = await response.json();
    const jsonText = data.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonText);
}

async function getGeminiResponseForChunk(transcriptChunk, videoTitle, apiKey, isFirst, isLast) {
    const finalApiUrl = `${GEMINI_API_URL}?key=${apiKey}`;
    let context = "This is a middle part of the content. Summarize it concisely.";
    if (isFirst && isLast) context = "This is the entire content.";
    else if (isFirst) context = "This is the BEGINNING of the content.";
    else if (isLast) context = "This is the FINAL part of the content.";
    const prompt = `Summarize ONLY the provided content chunk. Do not refer to the source as "the video". Use markdown bullet points.
        Context: ${context}
        Content Chunk: ---
        ${transcriptChunk}
        ---`;
    const response = await fetch(finalApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ "contents": [{ "parts": [{ "text": prompt }] }] })
    });
    if (!response.ok) throw new Error(`Gemini API error: ${(await response.json()).error?.message}`);
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

// ========================================================
// GOOGLE DOCS & OTHER HELPER FUNCTIONS
// ========================================================
async function addContentToDoc(token, documentId, title, summary) {
    const textToInsert = `\n${title}\n\n**Summary**\n${summary}\n\n`;
    await appendText(token, documentId, textToInsert);
}

async function batchUpdate(token, documentId, requests) {
    if (requests.length === 0) return;
    const response = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests })
    });
    if (!response.ok) {
        console.error("Google Docs API Error Details:", await response.clone().json());
        throw new Error(`Failed to update doc. Status: ${response.status}`);
    }
    return response.json();
}
async function getCurrentEndIndex(token, documentId) {
    const getResponse = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}?fields=body(content)`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const doc = await getResponse.json();
    const lastElement = doc.body.content[doc.body.content.length - 1];
    return (lastElement.endIndex || 1) - 1; // Correct index for insertion
}
async function appendText(token, documentId, text) {
    const index = await getCurrentEndIndex(token, documentId);
    await batchUpdate(token, documentId, [{
        insertText: { location: { index }, text }
    }]);
}
async function appendImage(token, documentId, uri) {
    const index = await getCurrentEndIndex(token, documentId);
    const requests = [{
        insertInlineImage: {
            location: { index },
            uri: uri,
            // Removing fixed size for better reliability. Let Google Docs decide.
        }
    }];
    await batchUpdate(token, documentId, requests);
}
async function createGoogleDoc(token, title) {
    const response = await fetch('https://docs.googleapis.com/v1/documents', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
    });
    if (!response.ok) throw new Error(`Google Docs Error: ${(await response.json()).error?.message}`);
    return await response.json();
}
async function addFullNotesToDoc(token, documentId, title, summary) {
    const getResponse = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!getResponse.ok) throw new Error('Failed to get document for updating.');
    const doc = await getResponse.json();
    const lastElement = doc.body.content[doc.body.content.length - 1];
    let currentIndex = (lastElement.endIndex || 1);

    const textToInsert = `\n${title}\n\nSummary\n${summary}\n\n`;
    const requests = [{
        insertText: {
            location: { index: currentIndex - 1 },
            text: textToInsert,
        }
    }];

    const response = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests })
    });
    if (!response.ok) throw new Error(`Failed to add content to doc: ${(await response.json()).error?.message}`);
    return await response.json();
}
async function appendChunkToDoc(token, documentId, text) {
    const getResponse = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!getResponse.ok) throw new Error('Failed to get document for appending.');
    const doc = await getResponse.json();
    const lastElement = doc.body.content[doc.body.content.length - 1];
    const index = (lastElement.endIndex || 1) - 1;
    
    const requests = [{
        insertText: {
            location: { index },
            text: text + '\n'
        }
    }];

    const response = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests })
    });
    if (!response.ok) throw new Error(`Failed to append chunk to doc: ${(await response.json()).error?.message}`);
    return await response.json();
}
function chunkTranscript(text, maxSize = 5000) {
    const chunks = [];
    const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
    let currentChunk = "";
    for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > maxSize && currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = "";
        }
        currentChunk += sentence;
    }
    if (currentChunk) chunks.push(currentChunk.trim());
    return chunks;
}
function sendStatusUpdate(message, color = "black") {
    chrome.runtime.sendMessage({ action: "updateStatus", message, color });
}
function getAuthToken() {
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ 'interactive': true }, (token) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(token);
        });
    });
}