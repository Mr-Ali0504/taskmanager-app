const mongoose = require('mongoose');

// =============================================================================
// MongoDB Connection
// Reference: https://mongoosejs.com/docs/connections.html
//
// We use an async function so we can use await and handle errors cleanly.
// The MONGO_URI comes from the .env file so it can be different per environment:
//   - Development:  mongodb://localhost:27017/taskmanager
//   - Docker:       mongodb://mongo:27017/taskmanager  (uses Docker service name)
//   - Production:   mongodb+srv://user:pass@cluster.mongodb.net/taskmanager
// =============================================================================

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    // Exit with failure code — a process manager (PM2/systemd/Docker) will restart
    process.exit(1);
  }
};

module.exports = connectDB;
