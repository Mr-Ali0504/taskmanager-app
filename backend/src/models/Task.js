const mongoose = require('mongoose');

// =============================================================================
// Task Model — Defines the shape of a Task document in MongoDB
// Reference: https://mongoosejs.com/docs/guide.html
//
// In MongoDB, each document is a JSON-like object. Mongoose adds a "schema"
// on top of MongoDB to enforce structure, data types, and validation rules.
// =============================================================================

const TaskSchema = new mongoose.Schema(
  {
    // The task title — required and limited to 100 chars
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,             // Removes leading/trailing whitespace automatically
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },

    // An optional longer description
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },

    // Whether the task is done. Defaults to false (not completed)
    completed: {
      type: Boolean,
      default: false,
    },

    // Priority level — only these three values are valid (enforced by 'enum')
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },

    // Tracks which environment this task was created in (dev/staging/prod)
    // Useful for verifying your CI/CD pipeline deployed to the right environment
    environment: {
      type: String,
      default: process.env.NODE_ENV || 'development',
    },
  },
  {
    // timestamps: true automatically adds 'createdAt' and 'updatedAt' fields
    // and updates them on every save
    timestamps: true,
  }
);

// Export the model — 'Task' becomes the MongoDB collection name (pluralized to 'tasks')
module.exports = mongoose.model('Task', TaskSchema);
