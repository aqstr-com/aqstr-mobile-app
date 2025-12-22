# AQSTR Mobile

React Native mobile app for AQSTR - Earn Bitcoin by completing Nostr social tasks.

## Features

- 🔐 **Secure nsec storage** - Uses device keychain (iOS) / keystore (Android)
- ⚡ **Nostr event signing** - Sign likes, reposts, replies, and quotes
- 📱 **Native mobile experience** - Built with Expo and React Native
- 💰 **Task completion** - Earn sats for completing social tasks

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac) or Android Emulator

### Installation

```bash
cd aqstr-mobile
npm install
```

### Configure API URL

Edit `.env` to point to your Remix backend:

````bash

EXPO_PUBLIC_API_URL=https://aqstr.com

### Run the App

```bash
# Start Expo dev server
npm start

# Or run on specific platform
npm run ios
npm run android
````

## Project Structure

```
aqstr-mobile/
├── App.tsx                    # Main entry with AuthProvider
├── lib/
│   ├── storage.ts             # Secure nsec storage (expo-secure-store)
│   ├── nostr.ts               # Nostr event signing (nostr-tools)
│   └── api.ts                 # API client for Remix backend
├── contexts/
│   └── AuthContext.tsx        # Auth state management
├── app/
│   ├── (auth)/
│   │   └── login.tsx          # nsec login screen
│   └── (app)/
│       ├── dashboard.tsx      # Task list
│       └── task/[id].tsx      # Task detail with sub-tasks
└── .env                       # Environment configuration
```

## Security

- **nsec never leaves the device** - Stored in secure enclave
- **Only signed events are transmitted** - Private key is never sent to API
- **Event signing happens locally** - Using nostr-tools with direct key access

## API Integration

The app communicates with the remirxux-app Remix backend:

| Action           | Endpoint                  |
| ---------------- | ------------------------- |
| Login            | `POST /nostr-auth`        |
| Complete task    | `POST /api/task/complete` |
| Publish to Nostr | `POST /api/nostr/publish` |

Then run the mobile app and test the full flow.

## Tech Stack

- **React Native** - Cross-platform mobile
- **Expo** - Development and build tooling
- **nostr-tools** - Nostr protocol implementation
- **@noble/secp256k1** - Elliptic curve cryptography
- **expo-secure-store** - Secure credential storage
