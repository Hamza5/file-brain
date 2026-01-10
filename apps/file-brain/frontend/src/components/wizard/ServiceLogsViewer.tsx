import { useRef, useEffect, useState, useMemo } from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Tag } from 'primereact/tag';

interface ServiceLogsProps {
  visible: boolean;
  onHide: () => void;
  serviceName: string;
  userFriendlyName: string;
  status: string;
}

export function ServiceLogsViewer({ visible, onHide, serviceName, userFriendlyName, status }: ServiceLogsProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Extract actual service name from Docker container name
  // e.g., "file-brain-typesense-1" -> "typesense"
  // Memoize to prevent infinite loop
  const actualServiceName = useMemo(() => {
    const lower = serviceName.toLowerCase();
    if (lower.includes('typesense')) return 'typesense';
    if (lower.includes('tika')) return 'tika';
    return serviceName; // fallback to original name
  }, [serviceName]);

  // Fetch logs when dialog opens (initial fetch only)
  useEffect(() => {
    if (!visible || !actualServiceName) {
      return;
    }

    setLoading(true);
    
    // Initial fetch
    fetch(`/api/system/services/${actualServiceName}/logs`)
      .then(res => res.json())
      .then(data => {
        setLogs(data.logs || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch logs", err);
        setLogs(["Failed to load logs"]);
        setLoading(false);
      });
  }, [visible, actualServiceName]);

  // Separate effect for polling (only when visible and not ready)
  useEffect(() => {
    if (!visible || !actualServiceName || status === 'ready') {
      return;
    }

    // Poll for new logs while service is not ready
    const interval = setInterval(() => {
      fetch(`/api/system/services/${actualServiceName}/logs`)
        .then(res => res.json())
        .then(data => {
          setLogs(data.logs || []);
        })
        .catch(console.error);
    }, 2000);
    
    return () => {
      clearInterval(interval);
    };
  }, [visible, actualServiceName, status]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const severity = status === 'ready' ? 'success' : status === 'failed' ? 'danger' : 'warning';

  return (
    <Dialog 
      header={
        <div className="flex align-items-center gap-2">
          <span>{userFriendlyName} Logs</span>
          <Tag severity={severity} value={status?.toUpperCase()} />
        </div>
      }
      visible={visible} 
      style={{ width: '60vw', minWidth: '500px' }} 
      onHide={onHide}
      maximizable
    >
      <div className="flex flex-column h-full">
        {loading && logs.length === 0 ? (
          <div className="flex justify-content-center p-4">
            <ProgressSpinner style={{width: '50px', height: '50px'}} />
          </div>
        ) : (
          <div 
            className="surface-ground p-3 border-round font-mono text-sm"
            style={{ 
              height: '400px', 
              overflowY: 'auto',
              whiteSpace: 'pre-wrap'
            }}
          >
            {logs.length > 0 ? (
              logs.map((log, i) => (
                <div key={i} className="mb-1">{log}</div>
              ))
            ) : (
              <div className="text-500 font-italic text-center mt-4">No logs available</div>
            )}
            <div ref={logEndRef} />
          </div>
        )}
        
        <div className="flex justify-content-end mt-3">
          <Button label="Close" icon="fas fa-times" onClick={onHide} />
        </div>
      </div>
    </Dialog>
  );
}
