# FanZone

Football prediction app for fans. Predict live match events, earn coins, compete on leaderboards.

## Tech Stack

- **Frontend**: Flutter (Android + iOS) with Riverpod, GoRouter, Socket.IO
- **Backend**: NestJS (TypeScript) with Prisma, PostgreSQL, Redis, Socket.IO, Bull queues
- **Football Data**: API-Football (api-football.com)

## Quick Start

### Backend

```bash
cd backend

# Start PostgreSQL + Redis
docker compose up -d

# Install dependencies
npm install

# Generate Prisma client + push schema
npx prisma generate
npx prisma db push

# Seed achievements (optional)
npx prisma db seed

# Start dev server
npm run start:dev
```

Backend runs on `http://localhost:3000`

### Frontend

```bash
cd frontend

# Install dependencies
flutter pub get

# Run on Android emulator
flutter run

# Run on iOS simulator (macOS only)
flutter run -d ios
```

### Environment Variables

Copy `backend/.env` and set:
- `API_FOOTBALL_KEY` — Get from api-football.com
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — Change for production

## Architecture

```
fanzone/
├── backend/           # NestJS API server
│   ├── src/
│   │   ├── auth/      # JWT authentication
│   │   ├── matches/   # Live match data + polling
│   │   ├── questions/  # Prediction questions engine
│   │   ├── predictions/ # Submit + scoring
│   │   ├── leaderboard/ # Redis sorted sets
│   │   ├── feed/       # Activity feed
│   │   ├── websocket/  # Socket.IO gateway
│   │   └── common/     # Prisma, Redis, API-Football
│   └── prisma/        # Database schema
│
└── frontend/          # Flutter mobile app
    └── lib/
        ├── app/        # Theme, router, constants
        ├── core/       # Network, storage, models
        ├── features/   # Auth, Live, Predict, Leaderboard, Feed, Profile
        └── shared/     # Reusable widgets + utils
```

## Features

1. **Live Matches** — Real-time scores, stats, events via WebSocket
2. **Predictions** — Answer timed questions about match events
3. **Leaderboard** — Match/weekly/global/country rankings
4. **Activity Feed** — Live feed of predictions and events
5. **Profile** — XP, levels, streaks, achievements, badges

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/register | Create account |
| POST | /auth/login | Get JWT |
| POST | /auth/refresh | Refresh JWT |
| GET | /matches/live | Live matches |
| GET | /matches/today | Today's schedule |
| GET | /matches/:id | Match detail |
| GET | /questions/active/:fixtureId | Current question |
| POST | /predictions | Submit prediction |
| GET | /predictions/history | Past predictions |
| GET | /leaderboard?scope=... | Rankings |
| GET | /profile/me | User profile |
| GET | /feed/:fixtureId | Activity feed |
