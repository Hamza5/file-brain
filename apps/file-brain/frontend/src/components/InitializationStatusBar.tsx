import { useStatus } from '../context/StatusContext';
import { Tag } from 'primereact/tag';
import { ProgressBar } from 'primereact/progressbar';
import { type ServiceInitStatus } from '../api/client';

export function InitializationStatusBar() {
  const { systemInitialization, isInitializationComplete } = useStatus();
  
  // Only show if fully complete is false, OR if there are degraded services
  if (!systemInitialization) return null;
  
  // Find interesting services (not healthy)
  const degradedServices = Object.values(systemInitialization.services ?? {})
    .filter((service) => {
        const s = service as unknown as ServiceInitStatus;
        return s.state && s.state !== 'ready' && s.state !== 'disabled';
    });
  
  // If complete and no degraded services (all valid or disabled), don't show
  if (isInitializationComplete && degradedServices.length === 0) return null;
  
  // Styling for bottom bar
  const bottomBarStyle = {
    position: 'fixed' as const,
    bottom: 0,
    left: 0,
    width: '100%',
    zIndex: 1000,
    boxShadow: '0 -2px 10px rgba(0,0,0,0.1)'
  };
  
  return (
    <div className="surface-overlay border-top-1 border-200 p-2 flex align-items-center justify-content-between px-4" style={bottomBarStyle}>
      <div className="flex align-items-center gap-3">
        {!isInitializationComplete && <i className="pi pi-spin pi-spinner text-primary" />}
        <span className="font-medium text-700 text-sm">
          {isInitializationComplete 
           ? "System operating in degraded mode" 
           : `Initializing background services... ${systemInitialization.initialization_progress.toFixed(0)}%`
          }
        </span>
      </div>
      
      <div className="flex align-items-center gap-2">
        {degradedServices.map((service) => {
          const s = service as unknown as ServiceInitStatus;
          const state = s.state || 'unknown';
          return (
            <Tag 
                key={s.name}
                severity={state === 'failed' ? 'danger' : 'warning'} 
                value={`${s.user_friendly_name}: ${state.toUpperCase()}`}
                icon={state === 'failed' ? 'pi pi-times' : 'pi pi-spin pi-spinner'}
                className="text-xs"
            />
          );
        })}
      </div>
      
      {!isInitializationComplete && (
        <div className="w-2">
           <ProgressBar value={systemInitialization.initialization_progress} showValue={false} style={{ height: '6px' }} />
        </div>
      )}
    </div>
  );
}
