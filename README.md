# YouTube Gemini Notes Chrome Extension

A Chrome extension that automatically generates comprehensive notes from YouTube videos using Google's Gemini AI and saves them directly to Google Docs.

## Features

- **Automatic Transcript Processing**: Extracts YouTube video transcripts automatically
- **AI-Powered Summarization**: Uses Gemini AI to generate detailed summaries
- **Google Docs Integration**: Saves notes directly to new or existing Google Docs
- **Flexible Summary Modes**:
  - Detailed Summary (Single Processing)
  - Chunked Summary (For Longer Videos)
- **Image Enhancement**: Optional capability to find and include relevant images
- **Settings Persistence**: Saves your configuration for convenience

## Requirements

- Google Chrome Browser
- Google Cloud Platform API Key
- Google Custom Search Engine ID (for image features)
- Google OAuth Client ID
- Appropriate API permissions enabled in GCP:
  - Gemini API
  - Google Docs API
  - Custom Search API

## Setup

1. Clone this repository
2. Set up your Google Cloud Project:
   - Enable necessary APIs
   - Create OAuth 2.0 credentials
   - Configure Custom Search Engine
3. Add your credentials to `manifest.json`:
   ```json
   "oauth2": {
     "client_id": "YOUR_CLIENT_ID",
     "scopes": [
       "https://www.googleapis.com/auth/documents",
       "https://www.googleapis.com/auth/cloud-platform"
     ]
   }
   ```
4. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the extension directory

## Usage

1. **Configure the Extension**:
   - Click the extension icon
   - Enter your API Key
   - Add your Search Engine ID (optional, for images)
   - Optionally specify a Google Doc ID
   - Select your preferred summary mode
   - Toggle image download option

2. **Generate Notes**:
   - Navigate to a YouTube video
   - Click the extension icon
   - Click "Generate Notes"
   - Wait for processing
   - The generated notes will open in a new Google Docs tab

## Technical Details

### Core Components

1. **Popup Interface** (`popup.html`, `popup.js`)
   - User interface for configuration
   - Settings management
   - Note generation triggers

2. **Content Script** (`content.js`)
   - YouTube page interaction
   - Transcript extraction
   - DOM manipulation

3. **Background Service** (`background.js`)
   - Main processing logic
   - API interactions
   - Google Docs management

4. **Image Processing** (`imageGenerator.js`)
   - Image query generation
   - Google Custom Search integration
   - Image download management

### Key Functions

```javascript
// Transcript extraction
waitForElement(selector, timeout = 5000)
getTranscript()

// AI Processing
getGeminiResponseDetailed(transcript, videoTitle, apiKey)
getGeminiResponseForChunk(transcriptChunk, videoTitle, apiKey, isFirst, isLast)

// Google Docs Integration
createGoogleDoc(token, title)
addContentToDoc(token, documentId, title, summary)
appendText(token, documentId, text)

// Image Processing
getSearchQueriesFromGemini(summary, apiKey)
findImages(queries, apiKey, searchEngineId)
downloadImagesAsFiles(urls, videoTitle)
```

## API Integration

### Gemini AI
- Uses the `gemini-1.5-flash-latest` model
- Handles both detailed and chunked summarization
- Generates image search queries

### Google Docs
- Creates new documents
- Appends content
- Handles markdown formatting
- Manages document updates

### Google Custom Search
- Finds relevant images
- Filters for high-quality results
- Manages image downloads

## Security Features

- Secure credential storage
- OAuth 2.0 authentication
- API key protection
- Sandboxed content script

## Permissions

```json
"permissions": [
  "activeTab",
  "scripting",
  "identity",
  "storage",
  "downloads"
],
"host_permissions": ["https://*.youtube.com/"]
```

## Error Handling

- Transcript extraction failures
- API response errors
- Network connectivity issues
- Authentication failures
- Document access problems

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.