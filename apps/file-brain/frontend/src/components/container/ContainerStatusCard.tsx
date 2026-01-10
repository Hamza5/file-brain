import { useState } from 'react';
import { Card } from 'primereact/card';
import { Tag } from 'primereact/tag';
import { ProgressBar } from 'primereact/progressbar';
import { type DockerService } from '../../api/client';
import { ServiceLogsViewer } from '../wizard/ServiceLogsViewer';

interface ContainerStatusCardProps {
  service: DockerService;
  friendlyName: string;
  icon: string;
  isServiceReady?: boolean; // Actual service readiness (not just Docker health)
}

export function ContainerStatusCard({ service, friendlyName, icon, isServiceReady = false }: ContainerStatusCardProps) {
  const [showLogs, setShowLogs] = useState(false);

  // Determine status and severity
  const isRunning = service.state === 'running';
  const isDockerHealthy = service.health === 'healthy';
  const isFailed = service.health === 'unhealthy' || (!isRunning && service.state !== 'starting');

  // Actual readiness combines Docker health AND service responding
  const isActuallyReady = isDockerHealthy && isServiceReady;

  let severity: 'success' | 'info' | 'warning' | 'danger' = 'info';
  let statusLabel = 'Starting';
  let statusIcon = 'fas fa-spinner fa-spin';

  if (isActuallyReady) {
    severity = 'success';
    statusLabel = 'Ready';
    statusIcon = 'fas fa-check-circle';
  } else if (isFailed) {
    severity = 'danger';
    statusLabel = 'Failed';
    statusIcon = 'fas fa-exclamation-circle';
  } else if (isDockerHealthy && !isServiceReady) {
    // Docker says healthy but service not responding yet
    severity = 'warning';
    statusLabel = 'Initializing';
    statusIcon = 'fas fa-circle-notch fa-spin';
  } else if (isRunning) {
    severity = 'warning';
    statusLabel = 'Starting';
    statusIcon = 'fas fa-circle-notch fa-spin';
  }

  // Calculate progress
  const progress = isActuallyReady ? 100 : isDockerHealthy ? 75 : isRunning ? 50 : 0;

  // Status message
  const getStatusMessage = () => {
    if (isActuallyReady) return 'Component is ready';
    if (isFailed) return 'Component failed to start';
    if (isDockerHealthy && !isServiceReady) return 'Container healthy, waiting for service to respond...';
    if (isRunning) return 'Container starting, performing health checks...';
    return 'Starting component...';
  };

  return (
    <>
      <Card className="surface-card shadow-1 border-round">
        <div className="flex align-items-center justify-content-between mb-2">
          <div className="flex align-items-center gap-2">
            <i className={`${icon} text-primary`} />
            <span className="font-semibold">{friendlyName}</span>
          </div>
          <div className="flex align-items-center gap-2">
            <Tag severity={severity} value={statusLabel} icon={statusIcon} />
            {/* Logs viewer temporarily disabled - needs investigation
            <Button
              icon="fas fa-terminal"
              className="p-button-text p-button-sm"
              tooltip="View Logs"
              tooltipOptions={{ position: 'left' }}
              onClick={() => setShowLogs(true)}
            />
            */}
          </div>
        </div>

        <div className="mb-2">
          <div className="text-sm text-600 mb-1">
            {getStatusMessage()}
          </div>
          <ProgressBar
            value={progress}
            showValue={false}
            style={{ height: '6px' }}
            color={
              isFailed ? 'var(--red-500)' :
              isActuallyReady ? 'var(--green-500)' :
              'var(--primary-color)'
            }
          />
        </div>
      </Card>

      {/* Logs viewer - reuse from wizard */}
      <ServiceLogsViewer
        visible={showLogs}
        onHide={() => setShowLogs(false)}
        serviceName={service.service}
        userFriendlyName={friendlyName}
        status={isActuallyReady ? 'ready' : isFailed ? 'failed' : 'initializing'}
      />
    </>
  );
}
