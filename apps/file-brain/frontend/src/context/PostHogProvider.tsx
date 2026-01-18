import posthog from 'posthog-js';
import { createContext, useContext, useEffect } from 'react';

const PostHogContext = createContext<typeof posthog | null>(null);

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Fetch PostHog config from backend
    const initializePostHog = async () => {
      try {
        const response = await fetch('/api/v1/config');
        const config = await response.json();
        
        if (!config.posthog.enabled) {
          console.log('PostHog telemetry is disabled');
          return;
        }

        // Initialize PostHog with backend config
        posthog.init(config.posthog.api_key, {
          api_host: config.posthog.host,
          autocapture: false,  // Disable auto-capture for privacy
          capture_pageview: false,  // Manual pageview tracking
          disable_session_recording: false,  // Enable session recording
          session_recording: {
            maskAllInputs: true,  // Mask all input fields
            maskTextSelector: '[data-private], .private',  // Additional masking
          },
          loaded: (posthog) => {
            // Use the same device ID as backend for unified session tracking
            // This ensures frontend and backend events are grouped in the same session
            posthog.identify(config.posthog.device_id);
            console.log('PostHog initialized with device ID:', config.posthog.device_id.substring(0, 16) + '...');
          }
        });
        
        console.log('PostHog initialized for frontend analytics');
      } catch (error) {
        console.error('Failed to initialize PostHog:', error);
      }
    };

    initializePostHog();
  }, []);

  return (
    <PostHogContext.Provider value={posthog}>
      {children}
    </PostHogContext.Provider>
  );
}

export const usePostHog = () => useContext(PostHogContext);
