// =============================================================================
// Backend Tests — Using Jest + Supertest
// Reference: https://jestjs.io/  |  https://github.com/ladjs/supertest
//
// Supertest lets you make HTTP requests to your Express app in tests
// WITHOUT actually starting a real server on a port.
// Jest is the test runner that finds and runs the tests.
//
// Run with: npm test
// =============================================================================

const request = require('supertest');
const app = require('../app');

// Mock the database connection so tests don't need a real MongoDB
// Reference: https://jestjs.io/docs/jest-object#jestmockmodulename-factory-options
jest.mock('../config/db', () => jest.fn());

// Mock the Task model so tests don't touch a real database
jest.mock('../models/Task');
const Task = require('../models/Task');

// ─── Test Suite for GET /api/health ────────────────────────────────────────────
describe('GET /api/health', () => {
  it('should return status OK', async () => {
    // 'request(app)' creates a test client for the Express app
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('OK');
  });
});

// ─── Test Suite for GET /api/tasks ─────────────────────────────────────────────
describe('GET /api/tasks', () => {
  it('should return all tasks', async () => {
    // Mock Task.find() to return a fake list — no real DB needed
    const mockTasks = [
      { _id: '1', title: 'Test task 1', completed: false, priority: 'medium' },
      { _id: '2', title: 'Test task 2', completed: true, priority: 'high' },
    ];
    // Chaining .sort() so we mock the full query chain
    Task.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(mockTasks) });

    const res = await request(app).get('/api/tasks');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
  });
});

// ─── Test Suite for POST /api/tasks ────────────────────────────────────────────
describe('POST /api/tasks', () => {
  it('should create a new task', async () => {
    const newTask = { title: 'New Task', priority: 'high' };
    // Mock Task.create() to return the task as if it was saved
    Task.create.mockResolvedValue({ _id: '3', ...newTask, completed: false });

    const res = await request(app)
      .post('/api/tasks')
      .send(newTask);

    expect(res.statusCode).toBe(201);     // 201 = Created
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('New Task');
  });

  it('should return 400 if title is missing', async () => {
    Task.create.mockRejectedValue(new Error('Task validation failed: title is required'));

    const res = await request(app)
      .post('/api/tasks')
      .send({});  // Empty body — no title

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
