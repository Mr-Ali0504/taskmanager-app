const express = require('express');
const router = express.Router();
const Task = require('../models/Task');

// =============================================================================
// Task Routes — CRUD operations for the Task resource
// Reference: https://expressjs.com/en/guide/routing.html
//
// All routes here are mounted at /api/tasks in app.js
// So router.get('/') handles GET /api/tasks
//    router.post('/') handles POST /api/tasks  etc.
// =============================================================================

// ─── GET /api/tasks ────────────────────────────────────────────────────────────
// Fetch all tasks, sorted by newest first
router.get('/', async (req, res) => {
  try {
    // -1 = descending (newest first), 1 = ascending (oldest first)
    const tasks = await Task.find().sort({ createdAt: -1 });
    res.json({ success: true, count: tasks.length, data: tasks });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/tasks ───────────────────────────────────────────────────────────
// Create a new task. Request body must contain at least { title }
router.post('/', async (req, res) => {
  try {
    // Task.create() validates against the schema and saves to MongoDB
    const task = await Task.create(req.body);
    // 201 = Created (more specific than 200 OK for resource creation)
    res.status(201).json({ success: true, data: task });
  } catch (error) {
    // 400 = Bad Request (e.g., validation failed — missing title)
    res.status(400).json({ success: false, error: error.message });
  }
});

// ─── PUT /api/tasks/:id ────────────────────────────────────────────────────────
// Update a task by its MongoDB ID (e.g., toggle completed, change priority)
router.put('/:id', async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(
      req.params.id,  // The :id from the URL
      req.body,       // The fields to update from the request body
      {
        new: true,          // Return the updated document, not the original
        runValidators: true, // Re-run schema validators (e.g., enum check on priority)
      }
    );
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ─── DELETE /api/tasks/:id ─────────────────────────────────────────────────────
// Delete a task by its MongoDB ID
router.delete('/:id', async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    res.json({ success: true, data: {} });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
