import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PostHogProvider } from './context/PostHogProvider'

if (import.meta.env.PROD) {
  // Prevent F12 key
  document.onkeydown = function (e) {
    if (e.key === "F12") {
      e.preventDefault();
    }
    // Prevent Ctrl+P (Print), Ctrl+S (Save), Ctrl+F (Find), Ctrl+U (View Source)
    if (e.ctrlKey && (e.key === 'p' || e.key === 's' || e.key === 'f' || e.key === 'u')) {
      e.preventDefault();
    }
    // Prevent Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C (DevTools)
    if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) {
      e.preventDefault();
    }
  };

  // Prevent right-click
  document.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PostHogProvider>
      <App />
    </PostHogProvider>
  </StrictMode>,
)
