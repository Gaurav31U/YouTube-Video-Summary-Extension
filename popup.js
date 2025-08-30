document.addEventListener('DOMContentLoaded', () => {
    // Load all saved settings, including includeImages
    chrome.storage.local.get(['apiKey', 'searchEngineId', 'documentId', 'summaryMode', 'downloadImages'], (result) => {
        if (result.apiKey) document.getElementById('apiKey').value = result.apiKey;
        if (result.searchEngineId) document.getElementById('searchEngineId').value = result.searchEngineId;
        if (result.documentId) document.getElementById('documentId').value = result.documentId;
        if (result.summaryMode) document.getElementById('summaryMode').value = result.summaryMode;
        if (result.downloadImages) document.getElementById('downloadImages').checked = result.downloadImages; // Load checkbox state
    });

    document.getElementById('saveSettings').addEventListener('click', () => {
        const apiKey = document.getElementById('apiKey').value;
        const searchEngineId = document.getElementById('searchEngineId').value;
        const documentId = document.getElementById('documentId').value;
        const summaryMode = document.getElementById('summaryMode').value;
        const downloadImages = document.getElementById('downloadImages').checked; // Get checkbox state

        if (apiKey) { // Only API key is strictly required to save
            chrome.storage.local.set({ apiKey, searchEngineId, documentId, summaryMode, downloadImages }, () => {
                updateStatus('Settings saved!', 'green');
            });
        } else {
            updateStatus('Please provide an API Key.', 'red');
        }
    });

    document.getElementById('generateNotes').addEventListener('click', () => {
        chrome.storage.local.get(['apiKey', 'searchEngineId'], (result) => {
            if (!result.apiKey) {
                updateStatus('Error: API Key must be set in settings.', 'red');
                return;
            }
            
            const downloadImages = document.getElementById('downloadImages').checked;
            if (downloadImages && !result.searchEngineId) {
                updateStatus('Error: Search Engine ID is required to download images.', 'red');
                return;
            }

            const documentId = document.getElementById('documentId').value.trim();
            const summaryMode = document.getElementById('summaryMode').value;

            updateStatus('Starting...', 'black');
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                updateStatus('Extracting transcript...', 'black');
                chrome.tabs.sendMessage(tabs[0].id, { action: "getTranscript" }, (response) => {
                    if (chrome.runtime.lastError) {
                        updateStatus('Error: Could not connect. Refresh the page.', 'red');
                        return;
                    }
                    if (response && response.transcript) {
                        chrome.runtime.sendMessage({
                            action: "generateNotes",
                            transcript: response.transcript,
                            videoTitle: response.title,
                            documentId: documentId,
                            summaryMode: summaryMode,
                            downloadImages: downloadImages // Pass the checkbox state
                        });
                    } else {
                        updateStatus('Error: Could not find a transcript to process.', 'red');
                    }
                });
            });
        });
    });

    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === "updateStatus") { updateStatus(request.message, request.color); }
    });
});

function updateStatus(message, color) {
    const statusElement = document.getElementById('status');
    statusElement.textContent = message;
    statusElement.style.color = color;
}