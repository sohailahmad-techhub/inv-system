# Invoice System (Next.js + Express + MongoDB)

Scaffold for an invoice system with a Next.js (pages router) frontend and an Express + MongoDB (Mongoose) backend.

## Project Structure

- `pages/`, `components/`, `lib/`, `types/`, `styles/` - Next.js frontend
- `api/` - Express backend (TypeScript)
- `docker-compose.yml` - local MongoDB

## Prerequisites

- Node.js 18+
- Docker (for local MongoDB)

## Environment Variables

### Frontend

Copy the example and adjust as needed:

```bash
cp .env.local.example .env.local
```

### Backend

Copy the example and adjust as needed:

```bash
cp api/.env.example api/.env
```

## Local Development

### 1) Start MongoDB

```bash
docker compose up -d
```

### 2) Install dependencies

```bash
npm install
```

### 3) Start the backend (Express)

```bash
npm run server
```

The backend will expose:

- `GET http://localhost:5000/health`

### 4) Start the frontend (Next.js)

In another terminal:

```bash
npm run dev
```

Frontend runs at `http://localhost:3000`.

## Notes

- The backend uses Mongoose with a configurable connection pool (`MONGODB_MAX_POOL_SIZE`).
- `NEXT_PUBLIC_API_URL` controls which backend the frontend calls.
