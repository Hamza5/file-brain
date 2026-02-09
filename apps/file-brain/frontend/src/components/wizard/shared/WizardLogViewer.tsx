import React, { useRef, useEffect } from 'react';

interface WizardLogViewerProps {
  logs: string[];
  title?: string;
  maxHeight?: string;
}

/**
 * Unified log viewer component for wizard steps.
 * Provides consistent styling and auto-scroll behavior.
 */
export const WizardLogViewer: React.FC<WizardLogViewerProps> = ({
  logs,
  title = 'Logs',
  maxHeight = '300px',
}) => {
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  return (
    <div className="p-3 surface-100 border-round" style={{ maxHeight, overflow: 'auto' }}>
      <div className="text-sm font-semibold mb-2 text-600">{title}</div>
      <code className="text-xs">
        {logs.length > 0 ? (
          logs.map((log, idx) => (
            <div key={idx} className="text-600 mb-1">
              {log}
            </div>
          ))
        ) : (
          <div className="text-500 font-italic">No logs available</div>
        )}
        <div ref={logEndRef} />
      </code>
    </div>
  );
};
