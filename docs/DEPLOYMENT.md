# Deployment Guide

## Prerequisites
- Docker
- Docker Compose

## Running locally
1. Clone the repository
2. Run `docker-compose up --build`
3. Backend: http://localhost:5000
4. Frontend: http://localhost:3000
5. API Docs: http://localhost:5000/api-docs

## Production
Deploy using a cloud provider that supports Docker (AWS ECS, DigitalOcean App Platform, Railway, etc.).
Set environment variables:
- MONGO_URI
- NODE_ENV=production
- JWT_SECRET
- etc.
