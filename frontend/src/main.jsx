import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// =============================================================================
// React Entry Point
// Reference: https://react.dev/reference/react-dom/client/createRoot
//
// ReactDOM.createRoot() is the modern React 18 way to mount your app.
// It enables concurrent features (like automatic batching, Suspense, etc.)
// =============================================================================

ReactDOM.createRoot(document.getElementById('root')).render(
  // StrictMode runs extra checks in development to find common mistakes.
  // It renders components twice in dev to detect side effects.
  // Has ZERO effect in production builds.
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
