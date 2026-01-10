import { useStatus } from '../../context/StatusContext';
import { Tag } from 'primereact/tag';
import { ProgressBar } from 'primereact/progressbar';
import { type ServiceInitStatus } from '../../api/client';

export function InitializationStatusBar() {
  const { systemInitialization, isInitializationComplete } = useStatus();
  
  if (!systemInitialization) return null;
  
  // Find services that are not ready
  const pendingServices = Object.values(systemInitialization.services ?? {})
    .filter((service) => {
      const s = service as unknown as ServiceInitStatus;
      return s.state && s.state !== 'ready' && s.state !== 'disabled';
    });
  
  // Hide if complete and all services are ready
  if (isInitializationComplete && pendingServices.length === 0) return null;
  
  // User-friendly service name mapping
  const getFriendlyName = (name: string | undefined) => {
    if (!name) return 'Service';
    const mapping: Record<string, string> = {
      'typesense': 'Search Engine',
      'tika': 'File Extractor',
      'docker': 'Services',
    };
    return mapping[name.toLowerCase()] || name;
  };

  return (
    <div 
      className="fixed bottom-0 left-0 w-full z-5 surface-overlay border-top-1 surface-border px-4 py-2 shadow-2"
    >
      <div className="flex align-items-center justify-content-between gap-3">
        {/* Status message */}
        <div className="flex align-items-center gap-2">
          {!isInitializationComplete && (
            <i className="fas fa-spinner fa-spin text-primary" />
          )}
          <span className="font-medium text-color-secondary text-sm">
            {isInitializationComplete 
              ? "Some features are unavailable" 
              : `Starting up... ${systemInitialization.initialization_progress.toFixed(0)}%`
            }
          </span>
        </div>
        
        {/* Service tags */}
        <div className="flex align-items-center gap-2">
          {pendingServices.map((service) => {
            const s = service as unknown as ServiceInitStatus;
            const state = s.state || 'unknown';
            const isFailed = state === 'failed';
            return (
              <Tag 
                key={s.name}
                severity={isFailed ? 'danger' : 'warning'} 
                value={`${getFriendlyName(s.name)}: ${isFailed ? 'Error' : 'Loading'}`}
                icon={isFailed ? 'fas fa-exclamation-circle' : 'fas fa-spinner fa-spin'}
                className="text-xs"
              />
            );
          })}
        </div>
        
        {/* Progress bar */}
        {!isInitializationComplete && (
          <div className="w-8rem hidden md:block">
            <ProgressBar 
              value={systemInitialization.initialization_progress} 
              showValue={false} 
              style={{ height: '6px' }} 
            />
          </div>
        )}
      </div>
    </div>
  );
}
