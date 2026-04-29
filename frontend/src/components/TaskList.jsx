import TaskCard from './TaskCard';

// =============================================================================
// TaskList Component
// Renders the list of tasks or appropriate empty/loading states.
//
// Props:
//   tasks   — array of task objects from the API
//   loading — boolean, true while the initial fetch is in progress
//   onToggle(id, completed) — called when user clicks the checkbox
//   onDelete(id)            — called when user clicks delete
// =============================================================================

function TaskList({ tasks, loading, onToggle, onDelete }) {
  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        Loading tasks...
      </div>
    );
  }

  return (
    <div className="task-list">
      <h2>📋 Tasks ({tasks.length})</h2>

      {tasks.length === 0 ? (
        <div className="task-empty card">
          <span className="icon">🎯</span>
          <p>No tasks yet. Add one above to get started!</p>
        </div>
      ) : (
        // Map over the tasks array and render a TaskCard for each
        // 'key' is required by React to efficiently update the list
        tasks.map(task => (
          <TaskCard
            key={task._id}
            task={task}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ))
      )}
    </div>
  );
}

export default TaskList;
