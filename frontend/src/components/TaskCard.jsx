// =============================================================================
// TaskCard Component
// Renders a single task with its checkbox, title, description, priority, and delete button.
//
// Props:
//   task     — a single task object from the API
//   onToggle — called when user clicks the checkbox
//   onDelete — called when user clicks delete
// =============================================================================

function TaskCard({ task, onToggle, onDelete }) {
  // Format the date in a readable way
  const date = new Date(task.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`task-card ${task.completed ? 'completed' : ''}`}>
      {/* Custom circular checkbox */}
      <button
        className={`task-checkbox ${task.completed ? 'checked' : ''}`}
        onClick={() => onToggle(task._id, task.completed)}
        title={task.completed ? 'Mark as pending' : 'Mark as complete'}
        aria-label={`Toggle task: ${task.title}`}
      />

      {/* Task body */}
      <div className="task-content">
        <div className="task-title">{task.title}</div>
        {task.description && (
          <div className="task-desc">{task.description}</div>
        )}
        <div className="task-meta">
          {/* Priority badge — CSS class determines color (low/medium/high) */}
          <span className={`priority-badge ${task.priority}`}>
            {task.priority}
          </span>
          <span className="task-date">{date}</span>
          {/* Show which environment this task was created in */}
          {task.environment && (
            <span className="task-date">· {task.environment}</span>
          )}
        </div>
      </div>

      {/* Delete button */}
      <button
        className="btn-delete"
        onClick={() => onDelete(task._id)}
        title="Delete task"
        aria-label={`Delete task: ${task.title}`}
      >
        ✕
      </button>
    </div>
  );
}

export default TaskCard;
