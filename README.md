# VisionAlly — Employment Platform for Job Seekers with Disabilities

> **Empowering job seekers with disabilities through intelligent career coaching, smart job discovery, AI-powered mock interviews, and inclusive workplace support.**

---

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start (Full Setup)](#quick-start-full-setup)
  - [Step 1 — Clone the Repository](#step-1--clone-the-repository)
  - [Step 2 — API Keys & Environment Files](#step-2--api-keys--environment-files)
  - [Step 3 — Install Frontend Dependencies](#step-3--install-frontend-dependencies)
  - [Step 4 — Install Backend Dependencies](#step-4--install-backend-dependencies)
  - [Step 5 — Configure Your Local IP Address](#step-5--configure-your-local-ip-address)
  - [Step 6 — Start the Backend Servers](#step-6--start-the-backend-servers)
  - [Step 7 — Start the React Native App](#step-7--start-the-react-native-app)
- [Features](#features)
- [Architecture & Tech Stack](#architecture--tech-stack)
- [Running on Physical Devices](#running-on-physical-devices)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
- [Environment Variables Reference](#environment-variables-reference)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Overview

VisionAlly is a **React Native (Expo)** mobile application paired with a **Python Flask + WebSocket** backend. It is purpose-built to help job seekers with disabilities navigate every stage of the hiring journey:

1. **Smart Chat Assistant** — AI career coaching via Google Gemini 2.5 Flash (text, image, audio, and document analysis)
2. **AI Mock Interview Room** — Real-time voice-based interview simulation via Gemini Live API with live audio streaming
3. **Job Discovery & Trends** — Live South African job listings powered by the Adzuna API, with market insights
4. **Profile & Onboarding** — "About Me" profile builder with disability/accommodation preferences, synced to Firebase
5. **Interview History** — Full transcript storage and scored feedback for every mock interview session

The app uses **Firebase Authentication** (email/password) and **Cloud Firestore** for user profiles, with **AsyncStorage** as a local-first cache for fast offline access.

---

## Prerequisites

Install these before proceeding:

| Requirement | Version | Download |
|---|---|---|
| **Node.js** | v16 or higher | https://nodejs.org/ |
| **npm** | Comes with Node.js | — |
| **Python** | 3.8 or higher | https://www.python.org/ |
| **Git** | Any recent version | https://git-scm.com/ |
| **Expo Go app** | Latest | [iOS App Store](https://apps.apple.com/app/expo-go/id982107779) / [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent) |

> **Note:** You do NOT need to install `expo-cli` globally. The project uses the local Expo SDK via `npx`.

---

## Quick Start (Full Setup)

Follow these steps in order. Both the **Flask API server** and the **WebSocket relay server** must be running for the full app to work.

---

### Step 1 — Clone the Repository

```bash
git clone https://github.com/Divin01/VisionAlly.git
cd VisionAlly
```

---

### Step 2 — API Keys & Environment Files

The project requires API keys that are **not committed to the repository** for security.

**The required configuration files are available in the same Google Drive folder where the project video demonstration was submitted.** Navigate to that shared Google Drive folder and locate the configuration file contents for the following:

| File | Purpose | Create in |
|---|---|---|
| `.env` | Gemini API keys for the Python backend | Project root (`VisionAlly/`) |
| `config.js` | Adzuna API credentials for job search | Project root (`VisionAlly/`) |
| `firebase.js` | Firebase project configuration | Project root (`VisionAlly/`) |

**Steps:**

1. Go to the **Google Drive folder** where the project video was submitted
2. Find the API keys in the Api_keys.docx (the word document) in the folder link
3. Create each file (`.env`, `config.js`, `firebase.js`) in the `VisionAlly/` project root
4. Copy the corresponding contents into each file and save

These files are already listed in `.gitignore`, so they will not be accidentally committed.

> **If you prefer to use your own API keys**, see the [Environment Variables Reference](#environment-variables-reference) section below for how to create these files manually.

---

### Step 3 — Install Frontend Dependencies

From the project root:

```bash
cd VisionAlly
npm install
```

This installs all React Native / Expo dependencies defined in `package.json`.

---

### Step 4 — Install Backend Dependencies

```bash
cd models/server
pip install -r requirements.txt
```

This installs: `flask`, `flask-cors`, `pillow`, `google-generativeai`, `python-dotenv`, `scipy`, `websockets`.

> **Tip:** It's recommended to use a Python virtual environment:
> ```bash
> # Create virtual environment (one time)
> py -m venv venv
>
> # Activate it
> # Windows:
> venv\Scripts\activate
> # macOS / Linux:
> source venv/bin/activate
>
> # Then install
> pip install -r requirements.txt
> ```

---

### Step 5 — Configure Your Local IP Address

The mobile app connects to the backend servers over your **local network**. You need to set your computer's local IP address in one file.

**Find your local IP:**

```bash
# Windows (Command Prompt or PowerShell):
ipconfig
# Look for "IPv4 Address" under your active network adapter (e.g. 192.168.1.100)

# macOS / Linux:
ifconfig
# Or: ip addr show
# Look for the inet address on your Wi-Fi/ethernet interface
```

**Update the API base URL** in `src/services/ApiService.js`:

Open the file and change the `BASE_URL` to your local IP:

```js
const API_CONFIG = {
  BASE_URL: 'http://YOUR_LOCAL_IP:5000',   // <-- Replace with your IP
  TIMEOUT: 90000,
};
```

For example, if your IP is `192.168.1.50`:
```js
BASE_URL: 'http://192.168.1.50:5000',
```

> **Important:** Your phone/emulator and your computer **must be on the same Wi-Fi network** for this to work.

> **For Android Emulator only:** You can use `http://10.0.2.2:5000` instead, which maps to the host machine's localhost.

---

### Step 6 — Start the Backend Servers

You need **two terminal windows** — one for each server.

#### Terminal 1 — Flask API Server (Chat + Document Analysis)

```bash
cd models/server
py app.py
```

You should see:
```
============================================================
VisionAlly AI Assistant Backend Starting
============================================================
Time: 2026-03-30 12:00:00
API Endpoint: http://0.0.0.0:5000/api/chatbot
Health Check: http://0.0.0.0:5000/health
Model: gemini-2.5-flash
============================================================
```

**Verify it works:** Open `http://YOUR_LOCAL_IP:5000/health` in a browser. You should see:
```json
{"status": "healthy", "message": "VisionAlly AI Assistant API is running"}
```

#### Terminal 2 — Gemini Live Relay Server (AI Interview Room)

```bash
cd models/server
py live_server.py
```

You should see:
```
============================================================
  VisionAlly — Gemini Live Relay Server
============================================================
  Model:   gemini-2.5-flash-native-audio-latest
  Listen:  ws://0.0.0.0:8765
============================================================
Server ready — waiting for connections…
```

> **Both servers must stay running** while you use the app. The Flask server handles AI chat, and the WebSocket server handles the live interview feature.

---

### Step 7 — Start the React Native App

Open a **third terminal** in the project root:

```bash
cd VisionAlly
npx expo start
```

This starts the Expo development server. You will see a QR code in the terminal.

**To run on your phone:**
1. Install the **Expo Go** app on your phone ([iOS](https://apps.apple.com/app/expo-go/id982107779) / [Android](https://play.google.com/store/apps/details?id=host.exp.exponent))
2. Make sure your phone is on the **same Wi-Fi network** as your computer
3. Scan the QR code:
   - **iOS:** Use the Camera app to scan the QR code
   - **Android:** Open Expo Go and tap "Scan QR code"

**To run on an emulator/simulator:**
- Press `a` in the terminal for Android emulator
- Press `i` in the terminal for iOS simulator (macOS only)
- Press `w` for web browser

---

## Features

| Feature | Description |
|---|---|
| **Firebase Auth** | Secure email/password authentication with persistent sessions |
| **Smart Chat** | Multi-modal AI chat — send text, images, audio recordings, or PDF documents for career guidance |
| **AI Interview Coach** | Live voice interview with Gemini Live API through a WebSocket relay server; scores and feedback after each session |
| **Job Discovery** | Browse South African job listings from Adzuna with category filters, salary ranges, and search |
| **Job Trends** | Market insight charts — top categories, salary trends, demand analysis |
| **About Me Profile** | Profile builder covering skills, experience, disability disclosure, accommodation needs, and career goals |
| **Onboarding Flow** | First-launch guided onboarding to capture user profile before accessing the main app |
| **Conversation History** | Auto-titled chat conversations with local persistence |
| **Interview History** | Past interview transcripts with AI-generated scores and feedback |
| **Document Analysis** | Upload job offers/CVs as images or PDFs for AI-powered analysis and recommendations |
| **Settings** | App preferences and account management |

---

## Architecture & Tech Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                     MOBILE APP (Expo / React Native)            │
│   React Navigation  ·  ChatContext  ·  AsyncStorage (cache)     │
│   expo-audio  ·  expo-camera  ·  expo-image-picker              │
└──────────┬─────────────────────────────────┬────────────────────┘
           │  HTTP REST (port 5000)          │  WebSocket (port 8765)
           ▼                                 ▼
┌─────────────────────┐         ┌──────────────────────────────┐
│  Flask API Server   │         │  Gemini Live Relay Server    │
│  (models/server/    │         │  (models/server/             │
│   app.py)           │         │   live_server.py)            │
│                     │         │                              │
│  • /api/chatbot     │         │  App ←WS→ Relay ←WS→ Gemini │
│  • /api/clear_session│        │  API key stays on server     │
│  • /api/analyse_doc │         │                              │
│  • /health          │         │                              │
└────────┬────────────┘         └──────────┬───────────────────┘
         │                                 │
         ▼                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Google Gemini AI APIs                          │
│   gemini-2.5-flash (chat)  ·  gemini-2.5-flash-native-audio    │
│                             (live interviews)                   │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────┐    ┌──────────────────────┐
│  Firebase           │    │  Adzuna Jobs API     │
│  • Auth             │    │  (South Africa)      │
│  • Cloud Firestore  │    │  Free: 250 calls/day │
└─────────────────────┘    └──────────────────────┘
```

### Frontend
| Technology | Purpose |
|---|---|
| React Native 0.81 + Expo SDK 54 | Cross-platform mobile framework |
| React Navigation 7 | Stack-based screen navigation |
| React Context API | Global state management (ChatContext) |
| AsyncStorage | Local-first persistence and caching |
| expo-audio / expo-av | Audio recording and playback |
| expo-camera | Camera access for interview room |
| expo-image-picker | Image selection for chat |
| expo-document-picker | PDF/document upload |
| expo-file-system | File I/O for audio WAV processing |
| Firebase JS SDK 11 | Authentication and Firestore |

### Backend
| Technology | Purpose |
|---|---|
| Python 3.8+ | Server runtime |
| Flask + flask-cors | REST API server (port 5000) |
| websockets | WebSocket relay server (port 8765) |
| google-generativeai | Gemini SDK for chat + file uploads |
| python-dotenv | Environment variable loading |
| Pillow (PIL) | Image processing |

### External Services
| Service | Purpose | Cost |
|---|---|---|
| Google Gemini API | AI chat + live interview | Free tier available |
| Firebase | Auth + Firestore database | Free Spark plan |
| Adzuna API | South African job listings | Free: 250 calls/day |

## Running on Physical Devices

### Android Phone
1. Ensure your phone and computer are on the **same Wi-Fi network**
2. Install **Expo Go** from the Play Store
3. Start all three servers (Flask, WebSocket, Expo)
4. Scan the QR code from the Expo terminal with Expo Go
5. The app will load and connect to your backend servers

### iPhone
1. Ensure your phone and computer are on the **same Wi-Fi network**
2. Install **Expo Go** from the App Store
3. Start all three servers (Flask, WebSocket, Expo)
4. Scan the QR code from the Expo terminal with your Camera app
5. It will prompt you to open in Expo Go

### Common Issues with Physical Devices
- **"Network request failed"** → Your IP address in `ApiService.js` is wrong, or your phone isn't on the same Wi-Fi
- **App loads but chat doesn't work** → Flask server isn't running. Check Terminal 1
- **Interview room closes immediately** → WebSocket server isn't running. Check Terminal 2
- **Firewall blocking connections** → Allow Python through your firewall (Windows will usually prompt you)

---

## Project Structure

```
VisionAlly/
├── App.js                              # Root component — wraps app in ChatProvider
├── app.json                            # Expo project configuration
├── babel.config.js                     # Babel config (expo preset)
├── config.js                           # Adzuna API credentials (not in repo — see Step 2)
├── firebase.js                         # Firebase init — Auth + Firestore (not in repo — see Step 2)
├── index.js                            # Entry point — registers root component
├── package.json                        # Node.js dependencies
├── .env                                # Gemini API keys (not in repo — see Step 2)
├── LICENSE                             # MIT License
│
├── assets/                             # App icons, splash screen, logos
│   ├── logo.png
│   ├── icon.png
│   ├── favicon.png
│   └── splash-icon.png
│
├── models/
│   ├── ai/
│   │   └── chatbot.py                  # (Reserved for future AI model code)
│   └── server/
│       ├── app.py                      # Flask REST API server (port 5000)
│       ├── live_server.py              # Gemini Live WebSocket relay (port 8765)
│       ├── requirements.txt            # Python dependencies
│       └── system_instructions.txt     # AI system prompt for chat personality
│
└── src/
    ├── constants/
    │   └── colors.js                   # Design system — blue/black palette
    │
    ├── contexts/
    │   └── ChatContext.js              # Global chat state (React Context)
    │
    ├── navigation/
    │   └── AppNavigator.js             # Stack navigator — auth/main flow
    │
    ├── screens/
    │   ├── auth/
    │   │   └── LoginScreen.js          # Email/password login + signup
    │   └── main/
    │       ├── MainScreen.js           # Tab-based home (Chat, Jobs, etc.)
    │       ├── HomeScreen.js           # Dashboard / landing tab
    │       ├── SmartChatScreen.js      # Conversation list view
    │       ├── ChatConversationScreen.js  # Active chat with AI assistant
    │       ├── InterviewerScreen.js    # Interview setup (select job, start)
    │       ├── InterviewRoomScreen.js  # Live voice interview with Gemini
    │       ├── JobTrendsScreen.js      # Job market insights and trends
    │       ├── AboutMeScreen.js        # Profile / About Me editor
    │       ├── OnboardingScreen.js     # First-launch profile setup
    │       ├── SettingsScreen.js       # App settings
    │       └── components/
    │           ├── AudioPlayer.js      # Audio playback component
    │           ├── AudioRecorder.js    # Audio recording component
    │           ├── ChatInput.js        # Chat text/image/doc input bar
    │           ├── MarkdownText.js     # Markdown renderer for AI responses
    │           └── MessageBubble.js    # Chat message bubble component
    │
    ├── services/
    │   ├── ApiService.js              # HTTP client — Flask API communication
    │   ├── ChatStorageService.js      # AsyncStorage for conversations
    │   ├── GeminiLiveService.js       # WebSocket client for live interviews
    │   ├── InterviewStorageService.js # AsyncStorage for interview sessions
    │   ├── JobService.js              # Adzuna API client for job listings
    │   └── UserProfileService.js     # Profile CRUD — local cache + Firebase
    │
    └── utils/
        └── storage.js                 # Low-level AsyncStorage helpers
```
---

## API Endpoints

The Flask server (`models/server/app.py`) exposes the following REST endpoints:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check — returns server status |
| `POST` | `/api/chatbot` | Send a message to the AI assistant (supports text, image, audio, document) |
| `POST` | `/api/clear_session` | Clear a specific chat session by `conversation_id` |
| `POST` | `/api/analyse_document` | Analyse a job document (image/PDF) via base64 payload |

### POST `/api/chatbot`

Send as `multipart/form-data`:

| Field | Type | Required | Description |
|---|---|---|---|
| `message` | string | No* | Text message |
| `conversation_id` | string | No | Existing conversation ID (auto-generated if empty) |
| `image` | file | No* | Image file (JPEG, PNG, WEBP, HEIC) |
| `audio` | file | No* | Audio recording (WebM) |
| `document` | file | No* | PDF or text document |
| `max_tokens` | string | No | Max response tokens (default: 800, max: 4096) |

*At least one of `message`, `image`, `audio`, or `document` is required.

**Response:**
```json
{
  "response": "AI assistant response text...",
  "conversation_id": "conv_20260330_120000",
  "conversation_title": "CV Review Feedback",
  "status": "success",
  "processing_time": 2.34
}
```

### WebSocket — Gemini Live Relay (port 8765)

The WebSocket relay server (`models/server/live_server.py`) handles real-time voice interviews:

1. Client connects to `ws://YOUR_IP:8765`
2. Client sends a `setup` message with system instructions and voice config
3. Server connects to Gemini Live API and relays messages bidirectionally
4. Audio chunks flow: `App → Relay → Gemini → Relay → App`
5. The API key never leaves the server

---

## Environment Variables Reference

If you want to set up your own API keys instead of using the ones from the Google Drive folder, create these files:

### `.env` (project root)

```env
# Gemini API key for the Flask chat server
GEMINI_API_KEY=your_gemini_api_key_here

# Gemini API key for the Live interview relay server
GEMINI_LIVE_API_KEY=your_gemini_live_api_key_here
```

**How to get Gemini API keys:**
1. Go to https://aistudio.google.com/app/apikey
2. Click "Create API key" → Select or create a Google Cloud project
3. Copy the key (starts with `AIza...`)
4. You can use the same key for both `GEMINI_API_KEY` and `GEMINI_LIVE_API_KEY`, or create separate keys

> **Important:** Use keys from **AI Studio**, not from Google Cloud Console API credentials. AI Studio keys have Live API access enabled by default.

### `config.js` (project root)

```js
const CONFIG = {
  ADZUNA_APP_ID:  'your_adzuna_app_id',
  ADZUNA_APP_KEY: 'your_adzuna_app_key',
};

export default CONFIG;
```

**How to get Adzuna API keys:**
1. Go to https://developer.adzuna.com/
2. Register for free (no credit card required)
3. Verify your email → Dashboard → "Create App"
4. Copy your App ID and App Key

### `firebase.js` (project root)

```js
import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "your_firebase_api_key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123def456"
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

export const firestore = getFirestore(app);
export default app;
```

**How to set up Firebase:**
1. Go to https://console.firebase.google.com/
2. Create a new project (or use existing)
3. Enable **Authentication** → Sign-in method → **Email/Password**
4. Enable **Cloud Firestore** → Create database (start in test mode for development)
5. Go to Project Settings → General → Your apps → Add a **Web app**
6. Copy the `firebaseConfig` object into your `firebase.js`

---

## Troubleshooting

### "Network request failed" or "Unable to connect to AI service"

| Cause | Fix |
|---|---|
| Wrong IP in `ApiService.js` | Run `ipconfig` (Windows) or `ifconfig` (Mac/Linux) and update `BASE_URL` |
| Flask server not running | Start it with `python app.py` in `models/server/` |
| Phone on different Wi-Fi | Connect phone and computer to the **same** Wi-Fi network |
| Firewall blocking port 5000 | Allow Python/port 5000 through your firewall |

### Interview room closes immediately

| Cause | Fix |
|---|---|
| WebSocket server not running | Start it with `python live_server.py` in `models/server/` |
| Wrong `GEMINI_LIVE_API_KEY` | Check your `.env` file has a valid key from AI Studio |
| Firewall blocking port 8765 | Allow Python/port 8765 through your firewall |

### "GEMINI_API_KEY not set"

The `.env` file is missing or not in the correct location. It must be in the **project root** (`VisionAlly/.env`), not inside `models/server/`.

> Note: The Python servers use `python-dotenv` and look for `.env` starting from the working directory. If you run `python app.py` from inside `models/server/`, it will look for `.env` in the project root because of `load_dotenv()` traversal. If that fails, copy `.env` into `models/server/` as well.

### "Module not found" errors (Python)

```bash
cd models/server
pip install -r requirements.txt
```

If you're using a virtual environment, make sure it's activated first.

### "Cannot find module" errors (JavaScript)

```bash
cd VisionAlly
rm -rf node_modules
npm install
```

### Expo Go errors

| Error | Fix |
|---|---|
| "Something went wrong" | Clear Expo cache: `npx expo start --clear` |
| QR code doesn't work | Make sure phone and computer are on the same Wi-Fi |
| App crashes on launch | Check the terminal for error logs |
| "Invariant Violation" | Run `npm install` again and restart Expo |

### Chat works but no job listings appear

The Adzuna API keys in `config.js` may be missing or invalid. Check that `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` are set correctly.

---

## Summary — What to Run

Here's the quick reference for running the full application:

```
Terminal 1 (Backend — Chat API):
  cd models/server
  python app.py

Terminal 2 (Backend — Interview WebSocket):
  cd models/server
  python live_server.py

Terminal 3 (Frontend — React Native):
  cd VisionAlly
  npx expo start
```

Then scan the QR code with Expo Go on your phone.

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

Copyright (c) 2026 VisionAlly
