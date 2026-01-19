import { useEffect, useRef } from "react";
import { useStatus } from "./StatusContext";
import { useNotification } from "./NotificationContext";

/**
 * IndexingNotifier - Detects when indexing completes and shows a notification
 * 
 * This component must be rendered inside both StatusProvider and NotificationProvider
 * to have access to both contexts.
 */
export function IndexingNotifier() {
  const { status, stats } = useStatus();
  const { showSuccess } = useNotification();
  const wasIndexingRef = useRef(false);

  useEffect(() => {
    const isCurrentlyIndexing = status?.running ?? false;
    
    // Detect transition from indexing to not indexing
    if (wasIndexingRef.current && !isCurrentlyIndexing) {
      const indexed = stats?.totals?.indexed ?? 0;
      const discovered = stats?.totals?.discovered ?? 0;
      
      // Only show notification if files were actually indexed
      if (indexed > 0) {
        showSuccess(
          "Indexing Complete",
          `Successfully indexed ${indexed.toLocaleString()} of ${discovered.toLocaleString()} files`
        );
      }
    }
    
    wasIndexingRef.current = isCurrentlyIndexing;
  }, [status?.running, stats?.totals?.indexed, stats?.totals?.discovered, showSuccess]);

  return null; // This component doesn't render anything
}
