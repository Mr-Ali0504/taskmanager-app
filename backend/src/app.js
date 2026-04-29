// =============================================================================
// Main Express Application Entry Point
// Reference: https://expressjs.com/en/starter/hello-world.html
// =============================================================================

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const taskRoutes = require('./routes/tasks');

// Load environment variables from .env file into process.env
// Must be called before any other code that uses process.env
dotenv.config();

// Connect to MongoDB (async — runs in the background)
connectDB();

const app = express();

// ─── Middleware ────────────────────────────────────────────────────────────────
// cors() allows the frontend (running on a different port/domain) to call this API
// Without CORS, the browser would block cross-origin requests
app.use(cors());

// express.json() parses incoming request bodies that have Content-Type: application/json
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────
// All task-related routes are defined in routes/tasks.js
// The prefix /api/tasks is added here so the route file stays clean
app.use('/api/tasks', taskRoutes);

// Health check endpoint — a standard DevOps pattern
// Used by: Jenkins to verify the app deployed correctly, load balancers, monitoring tools
// Returns the current environment so you can verify the right env is running
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ─── Start Server ──────────────────────────────────────────────────────────────
// process.env.PORT allows the port to be configured via environment variables
// This is essential for running in Docker, cloud, or CI/CD environments
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[${process.env.NODE_ENV || 'development'}] Backend running on port ${PORT}`);
});

// Export app for use in tests (supertest needs the express app instance)
module.exports = app;
