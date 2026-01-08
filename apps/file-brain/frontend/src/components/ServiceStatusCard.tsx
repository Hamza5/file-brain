import { useState } from 'react';
import { Card } from 'primereact/card';
import { ProgressBar } from 'primereact/progressbar';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { type ServiceInitStatus } from '../api/client';
import { ServiceLogsViewer } from './ServiceLogsViewer';

interface ServiceStatusCardProps {
  service: ServiceInitStatus;
}

export function ServiceStatusCard({ service }: ServiceStatusCardProps) {
  const [showLogs, setShowLogs] = useState(false);

  // Determine severity and icon based on state
  let severity: 'success' | 'info' | 'warning' | 'danger' | null = 'info';
  let icon = 'fas fa-spinner fa-spin';
  const currentState = service.state || 'unknown';
  let statusLabel = currentState.toUpperCase();
  
  switch(currentState) {
    case 'ready':
      severity = 'success';
      icon = 'fas fa-check';
      break;
    case 'failed':
      severity = 'danger';
      icon = 'fas fa-times';
      break;
    case 'disabled':
      severity = 'warning';
      icon = 'fas fa-ban';
      break;
    case 'not_started':
      severity = 'info';
      icon = 'fas fa-clock';
      statusLabel = 'WAITING';
      break;
    case 'initializing':
      severity = 'info';
      icon = 'fas fa-spinner fa-spin';
      statusLabel = service.current_phase?.name || 'INITIALIZING';
      break;
  }

  // Calculate progress
  // If ready, 100%. If initializing, use phase progress. Else 0.
  const progress = service.state === 'ready' ? 100 : 
                  service.state === 'initializing' ? (service.current_phase?.progress || 0) : 0;

  return (
    <>
      <Card className="surface-0 shadow-1 p-0 mb-3 border-round-xl service-status-card">
        <div className="flex align-items-center justify-content-between mb-2">
          <div className="flex align-items-center gap-2">
            <span className="text-xl font-bold text-900">{service.user_friendly_name}</span>
            <Tag severity={severity} value={statusLabel} icon={icon} />
          </div>
          <Button 
            icon="fas fa-list"
            className="p-button-text p-button-secondary p-button-sm" 
            tooltip="View Logs"
            onClick={() => setShowLogs(true)}
          />
        </div>
        
        <div className="mb-2">
          <div className="flex justify-content-between text-sm mb-1 text-700">
            <span>{service.current_phase?.message || service.error || "Waiting..."}</span>
            <span>{progress.toFixed(2)}%</span>
          </div>
          <ProgressBar 
            value={progress} 
            showValue={false} 
            style={{ height: '6px' }} 
            className={service.state === 'failed' ? 'bg-red-100' : ''}
            color={service.state === 'failed' ? 'var(--red-500)' : service.state === 'ready' ? 'var(--green-500)' : 'var(--blue-500)'}
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
