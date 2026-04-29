import { useState, useEffect } from 'react';
import axios from 'axios';
import TaskForm from './components/TaskForm';
import TaskList from './components/TaskList';

// =============================================================================
// App.jsx — Root Component
//
// This component owns the global state (tasks, loading, error) and
// passes data + handlers down to child components via props.
//
// State management approach: React hooks (useState, useEffect)
// API calls: Axios (cleaner than native fetch for JSON APIs)
//
// Reference: https://react.dev/learn/managing-state
// =============================================================================

// Read the API base URL from environment variables
// VITE_ prefix is required for Vite to expose env vars to the browser
// In dev: use the Vite proxy (empty string means relative URL → goes to proxy)
// In staging/prod: set VITE_API_URL in the Docker/deployment config
const API_URL = import.meta.env.VITE_API_URL || '';

function App() {
  // ─── State ─────────────────────────────────────────────────────────────────
  const [tasks, setTasks]       = useState([]);   // Array of task objects from the API
  const [loading, setLoading]   = useState(true); // Show spinner on initial load
  const [error, setError]       = useState(null); // Any error message to display
  const [health, setHealth]     = useState(null); // Health check response (shows env)

  // ─── Effects ───────────────────────────────────────────────────────────────
  // useEffect with [] runs ONCE when the component first mounts (like componentDidMount)
  useEffect(() => {
    fetchTasks();
    fetchHealth();
  }, []);

  // ─── API Calls ─────────────────────────────────────────────────────────────

  const fetchHealth = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/health`);
      setHealth(res.data);
    } catch {
      // Health check failure doesn't block the UI
    }
  };

  const fetchTasks = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await axios.get(`${API_URL}/api/tasks`);
      setTasks(res.data.data);
    } catch (err) {
      setError('Could not load tasks. Is the backend running?');
      console.error(err);
    } finally {
      // finally always runs — ensures loading stops whether success or error
      setLoading(false);
    }
  };

  const addTask = async (taskData) => {
    try {
      setError(null);
      const res = await axios.post(`${API_URL}/api/tasks`, taskData);
      // Prepend the new task to the top of the list (no need to re-fetch all)
      setTasks(prev => [res.data.data, ...prev]);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create task');
    }
  };

  const toggleTask = async (id, completed) => {
    try {
      const res = await axios.put(`${API_URL}/api/tasks/${id}`, { completed: !completed });
      // Update only the changed task in the array (avoid full re-fetch)
      setTasks(prev => prev.map(t => t._id === id ? res.data.data : t));
    } catch (err) {
      setError('Failed to update task');
    }
  };

  const deleteTask = async (id) => {
    try {
      await axios.delete(`${API_URL}/api/tasks/${id}`);
      // Remove the deleted task from state
      setTasks(prev => prev.filter(t => t._id !== id));
    } catch (err) {
      setError('Failed to delete task');
    }
  };

  // ─── Derived Stats ─────────────────────────────────────────────────────────
  const total     = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const pending   = total - completed;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-top">
          <h1>⚡ TaskFlow</h1>
          {health && (
            <span className={`env-badge ${health.environment}`}>
              ● {health.environment}
            </span>
          )}
        </div>
        <p>DevOps CI/CD Practice App · v{health?.version || '1.0.0'}</p>
      </header>

      {/* Error banner */}
      {error && <div className="error-banner">⚠️ {error}</div>}

      {/* Stats */}
      <div className="stats-bar">
        <div className="stat">
          <div className="stat-number">{total}</div>
          <div className="stat-label">Total Tasks</div>
        </div>
        <div className="stat">
          <div className="stat-number" style={{ color: 'var(--accent-yellow)' }}>{pending}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="stat">
          <div className="stat-number" style={{ color: 'var(--accent-green)' }}>{completed}</div>
          <div className="stat-label">Completed</div>
        </div>
      </div>

      {/* Add Task Form */}
      <TaskForm onAdd={addTask} />

      {/* Task List */}
      <TaskList
        tasks={tasks}
        loading={loading}
        onToggle={toggleTask}
        onDelete={deleteTask}
      />

      {/* Footer */}
      <footer className="footer">
        <p>🚀 Deployed via Jenkins CI/CD · MongoDB · Node.js · React</p>
      </footer>
    </div>
  );
}

export default App;
