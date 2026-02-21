import React, { useEffect, useRef } from 'react';
import { useInstantSearch } from 'react-instantsearch';
import { useStatus } from '../../context/StatusContext';
import { useNotification } from '../../context/NotificationContext';
import { useSearch } from '../../context/SearchContext';

export const SearchErrorHandler: React.FC = () => {
  const { error } = useInstantSearch({ catchError: true });
  const { isSystemHealthy, systemInitialization } = useStatus();
  const { showError } = useNotification();
  const { hasSearchSubmitted } = useSearch();
  
  // Track the previous error so we don't spam toasts for the same error
  const prevErrorRef = useRef<Error | null>(null);

  useEffect(() => {
    // Only process errors if the system is fully initialized and user has submitted a search
    const isReady = isSystemHealthy && systemInitialization?.initialization_progress === 100 && hasSearchSubmitted;
    
    if (error && isReady) {
      // Only show error if it's new or different
      if (!prevErrorRef.current || prevErrorRef.current.message !== error.message) {
        showError('Search Error', error.message || 'An error occurred during search.');
        prevErrorRef.current = error;
      }
    } else if (!error) {
      // Clear the tracked error when search is successful again
      prevErrorRef.current = null;
    }
  }, [error, isSystemHealthy, systemInitialization, hasSearchSubmitted, showError]);

  // This is a utility component, it doesn't render anything
  return null;
};
