import { useState } from 'react';

// =============================================================================
// TaskForm Component
// Handles the "Add Task" form UI and local form state.
// The actual API call is done by the parent (App.jsx) via the onAdd prop.
//
// Props:
//   onAdd(taskData) — called when the user submits the form
// =============================================================================

function TaskForm({ onAdd }) {
  // Local state for each form field
  const [title, setTitle]       = useState('');
  const [description, setDesc]  = useState('');
  const [priority, setPriority] = useState('medium');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    // Prevent the browser's default form behavior (which would reload the page)
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    await onAdd({ title: title.trim(), description: description.trim(), priority });
    setSubmitting(false);

    // Clear the form after successful submission
    setTitle('');
    setDesc('');
    setPriority('medium');
  };

  return (
    <div className="task-form card">
      <h2>➕ Add New Task</h2>
      {/* onSubmit handles Enter key and button click */}
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <input
            id="task-title"
            className="form-input"
            type="text"
            placeholder="Task title..."
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            maxLength={100}
          />
          {/* Controlled select — value is always in sync with React state */}
          <select
            id="task-priority"
            className="form-select"
            value={priority}
            onChange={e => setPriority(e.target.value)}
          >
            <option value="low">🟢 Low</option>
            <option value="medium">🟡 Medium</option>
            <option value="high">🔴 High</option>
          </select>
        </div>

        <div className="form-row">
          <textarea
            id="task-description"
            className="form-textarea"
            placeholder="Description (optional)..."
            value={description}
            onChange={e => setDesc(e.target.value)}
            maxLength={500}
          />
        </div>

        <div className="form-row">
          <button
            id="task-submit"
            type="submit"
            className="btn btn-primary"
            disabled={submitting || !title.trim()}
          >
            {submitting ? '⏳ Adding...' : '＋ Add Task'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default TaskForm;
