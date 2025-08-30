// This script runs on the YouTube page itself and is designed to be more robust.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getTranscript") {
        // We wrap the logic in an async function to use 'await'
        const getTranscriptAsync = async () => {
            const videoTitle = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.innerText || "Untitled Video";

            // First, wait for the main transcript renderer component to exist in the page.
            // This is crucial because it's loaded dynamically when you open the transcript.
            const transcriptContainer = await waitForElement("ytd-transcript-renderer");

            // If the container doesn't appear after a few seconds, give up.
            if (!transcriptContainer) {
                console.error("YouTube Notes Extension: Transcript container (ytd-transcript-renderer) not found.");
                sendResponse({ transcript: null, title: videoTitle });
                return;
            }
            
            // =========================================================================
            // THIS IS THE CORRECTED SELECTOR. The old one included ".segment" which is no longer reliable.
            // This now looks directly for the formatted string text inside each transcript line renderer.
            // =========================================================================
            const segments = document.querySelectorAll("ytd-transcript-segment-renderer yt-formatted-string");

            if (segments.length === 0) {
                 console.error("YouTube Notes Extension: Found the container, but no transcript segments were inside. This can happen if the transcript is empty or fails to load.");
                sendResponse({ transcript: null, title: videoTitle });
                return;
            }

            let transcriptText = '';
            segments.forEach(segment => {
                // Combine the text from all segments into one block
                transcriptText += segment.innerText + ' ';
            });
            
            // Success! Send the data back to the popup.
            sendResponse({ transcript: transcriptText, title: videoTitle });
        };

        getTranscriptAsync();
        
        // This is important! Return true to tell Chrome that we will send a response asynchronously.
        return true; 
    }
});

/**
 * A helper function that waits for an element to appear in the DOM.
 * It polls the page every 500ms up to a maximum timeout.
 * @param {string} selector - The CSS selector for the element.
 * @param {number} timeout - The max time to wait in milliseconds.
 * @returns {Promise<Element|null>} - A promise that resolves with the element or null if timed out.
 */
function waitForElement(selector, timeout = 5000) {
    return new Promise(resolve => {
        // Try to find the element immediately.
        const element = document.querySelector(selector);
        if (element) {
            resolve(element);
            return;
        }

        const interval = 500;
        let elapsedTime = 0;

        const timer = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(timer);
                resolve(element);
            } else {
                elapsedTime += interval;
                if (elapsedTime >= timeout) {
                    clearInterval(timer);
                    resolve(null); // Return null if we time out
                }
            }
        }, interval);
    });
}