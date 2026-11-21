# TaskFlow — DevOps CI/CD Practice App

A full-stack **Task Manager** application built for practicing Jenkins CI/CD pipelines,
Docker containerization, and multi-environment deployments.

## Stack

| Layer    | Technology                   |
|----------|------------------------------|
| Frontend | React + Vite + Nginx         |
| Backend  | Node.js + Express            |
| Database | MongoDB (via Mongoose)       |
| CI/CD    | Jenkins Declarative Pipeline |
| Infra    | Terraform + AWS EC2          |
| Containers | Docker + Docker Compose    |

---

## Project Structure

```
sample-app/
├── backend/
│   ├── src/
│   │   ├── app.js          # Express app entry point
│   │   ├── config/db.js    # MongoDB connection
│   │   ├── models/Task.js  # Task Mongoose model
│   │   ├── routes/tasks.js # CRUD API routes
│   │   └── tests/          # Jest + Supertest tests
│   ├── .env.example
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── components/
│   ├── index.html
│   ├── vite.config.js
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml
└── Jenkinsfile
```

---

## API Endpoints

| Method | Endpoint         | Description          |
|--------|-----------------|----------------------|
| GET    | /api/health     | Health check + env info |
| GET    | /api/tasks      | Get all tasks        |
| POST   | /api/tasks      | Create a new task    |
| PUT    | /api/tasks/:id  | Update a task        |
| DELETE | /api/tasks/:id  | Delete a task        |

---

## Running Locally with Docker

```bash
# Start all 3 services (MongoDB + Backend + Frontend)
docker-compose up --build

# Access the app
# Frontend: http://localhost:3000
# Backend:  http://localhost:5000/api/health
# MongoDB:  mongodb://localhost:27017
```

## Running Without Docker (for development)

```bash
# Terminal 1 — Start MongoDB (requires local MongoDB install)
# Or use Docker just for MongoDB:
docker run -d -p 27017:27017 mongo:7

# Terminal 2 — Start Backend
cd backend
cp .env.example .env
npm install
npm run dev

# Terminal 3 — Start Frontend
cd frontend
cp .env.example .env
npm install
npm run dev
# Open http://localhost:3000
```

---

## CI/CD Pipeline Stages

1. **Checkout** — Pull latest code from GitHub
2. **Test** — Run Jest unit tests
3. **Build** — Build Docker images (multi-stage)
4. **Push** — Push to Docker Hub registry
5. **Deploy Dev** — Auto-deploy to dev server
6. **Deploy Staging** — Requires manual approval in Jenkins
7. **Deploy Production** — Requires manual approval in Jenkins

---

## Relay Studio (separate app)

The `relay/` folder holds a separate, self-contained application for publishing videos to YouTube, Instagram and Facebook and tracking their performance. It does not use the task manager code above. See [relay/README.md](relay/README.md).
