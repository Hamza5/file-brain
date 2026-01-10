import { useState } from 'react';
import { Card } from 'primereact/card';
import { ProgressBar } from 'primereact/progressbar';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { type ServiceInitStatus } from '../../api/client';
import { ServiceLogsViewer } from './ServiceLogsViewer';

interface ServiceStatusCardProps {
  service: ServiceInitStatus;
}

// User-friendly labels for states
const stateLabels: Record<string, string> = {
  ready: 'Ready',
  failed: 'Error',
  disabled: 'Disabled',
  not_started: 'Waiting',
  initializing: 'Loading',
};

export function ServiceStatusCard({ service }: ServiceStatusCardProps) {
  const [showLogs, setShowLogs] = useState(false);

  // Determine severity and icon
  let severity: 'success' | 'info' | 'warning' | 'danger' | null = 'info';
  let icon = 'fas fa-spinner fa-spin';
  const currentState = service.state || 'unknown';
  const statusLabel = stateLabels[currentState] || currentState.toUpperCase();
  
  switch(currentState) {
    case 'ready':
      severity = 'success';
      icon = 'fas fa-check-circle';
      break;
    case 'failed':
      severity = 'danger';
      icon = 'fas fa-exclamation-circle';
      break;
    case 'disabled':
      severity = 'warning';
      icon = 'fas fa-ban';
      break;
    case 'not_started':
      severity = 'info';
      icon = 'fas fa-clock';
      break;
    case 'initializing':
      severity = 'info';
      icon = 'fas fa-spinner fa-spin';
      break;
  }

  // Calculate progress
  const progress = service.state === 'ready' ? 100 : 
                  service.state === 'initializing' ? (service.current_phase?.progress || 0) : 0;

  // User-friendly phase message
  const getMessage = () => {
    if (service.error) return service.error;
    if (service.current_phase?.message) return service.current_phase.message;
    if (currentState === 'not_started') return 'Waiting to start...';
    if (currentState === 'ready') return 'Running successfully';
    return 'Please wait...';
  };

  return (
    <>
      <Card className="surface-card shadow-1 mb-3 border-round-lg">
        {/* Header */}
        <div className="flex align-items-center justify-content-between mb-3">
          <div className="flex align-items-center gap-2">
            <span className="text-lg font-semibold text-color">{service.user_friendly_name}</span>
            <Tag severity={severity} value={statusLabel} icon={icon} />
          </div>
          <Button 
            icon="fas fa-terminal"
            className="p-button-text p-button-secondary p-button-sm" 
            tooltip="View Logs"
            tooltipOptions={{ position: 'left' }}
            onClick={() => setShowLogs(true)}
          />
        </div>
        
        {/* Message and Progress */}
        <div>
          <div className="flex justify-content-between text-sm mb-2">
            <span className="text-color-secondary">{getMessage()}</span>
            <span className="font-medium text-color">{progress.toFixed(0)}%</span>
          </div>
          <ProgressBar 
            value={progress} 
            showValue={false} 
            style={{ height: '8px' }} 
            color={
              currentState === 'failed' ? 'var(--red-500)' : 
              currentState === 'ready' ? 'var(--green-500)' : 
              'var(--primary-color)'
            }
          />
        </div>
      </Card>
      
      <ServiceLogsViewer 
        visible={showLogs}
        onHide={() => setShowLogs(false)}
        serviceName={service.name}
        userFriendlyName={service.user_friendly_name}
        status={service.state}
      />
    </>
  );
}
