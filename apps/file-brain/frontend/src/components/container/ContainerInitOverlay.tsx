import { useState, useEffect, useCallback } from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { ContainerStatusCard } from './ContainerStatusCard';
import { useStatus } from '../../context/StatusContext';
import { 
  startAppContainers, 
  connectAppContainerStatusStream,
  type AppContainerStatus,
  type DockerService 
} from '../../api/client';

interface ContainerInitOverlayProps {
  isVisible: boolean;
  onReady: () => void;
}

export function ContainerInitOverlay({ isVisible, onReady }: ContainerInitOverlayProps) {
  const [containerStatus, setContainerStatus] = useState<AppContainerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [inGracePeriod, setInGracePeriod] = useState(true); // Grace period to avoid premature failure detection
  const { isSystemHealthy, systemInitialization } = useStatus();

  // Start a grace period timer when overlay becomes visible
  useEffect(() => {
    if (isVisible) {
      setInGracePeriod(true);
      const timer = setTimeout(() => setInGracePeriod(false), 15000); // 15 seconds grace period for Typesense
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  const [hasStarted, setHasStarted] = useState(false);

  const startContainersAndMonitor = useCallback(async () => {
    setIsStarting(true);
    setHasStarted(true);
    setError(null);

    try {
      // Trigger container startup
      await startAppContainers();

      // Connect to status stream
      const cleanup = connectAppContainerStatusStream(
        (status) => {
          setContainerStatus(status);
        },
        (err) => {
          setError(err);
          setIsStarting(false);
        },
        () => {
          // Containers are healthy from Docker's perspective
          // But we'll wait for actual service readiness via isSystemHealthy
          setIsStarting(false);
        }
      );

      // Cleanup on unmount
      return () => cleanup();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start containers');
      setIsStarting(false);
    }
  }, []);

  // Start containers when overlay becomes visible
  useEffect(() => {
    if (isVisible && !isStarting && !hasStarted) {
      startContainersAndMonitor();
    }
  }, [isVisible, isStarting, hasStarted, startContainersAndMonitor]);

  // Check if we should dismiss the overlay
  // Only dismiss when:
  // 1. Containers are healthy (Docker health check)
  // 2. System is actually healthy (services responding)
  // 3. Initialization is complete (100%)
  useEffect(() => {
    const initComplete = systemInitialization?.initialization_progress === 100;
    if (containerStatus?.healthy && isSystemHealthy && initComplete) {
      // Small delay for smooth transition
      const timer = setTimeout(() => onReady(), 500);
      return () => clearTimeout(timer);
    }
  }, [containerStatus?.healthy, isSystemHealthy, systemInitialization?.initialization_progress, onReady]);

  const handleRetry = () => {
    startContainersAndMonitor();
  };

  // Group services by friendly name
  const getServicesByName = (): Record<string, DockerService> => {
    if (!containerStatus?.services) return {};
    
    const serviceMap: Record<string, DockerService> = {};
    containerStatus.services.forEach(service => {
      const serviceName = service.service?.toLowerCase() || '';
      if (serviceName.includes('typesense')) {
        serviceMap['search_engine'] = service;
      } else if (serviceName.includes('tika')) {
        serviceMap['file_extractor'] = service;
      }
    });
    return serviceMap;
  };

  const services = getServicesByName();
  // Don't show failures during the initial grace period to avoid premature "container failed" message
  const hasFailures = !inGracePeriod && (containerStatus?.services?.some(s => 
    s.health === 'unhealthy' || s.state !== 'running'
  ) || !!error);

  // Determine overlay message based on state
  const getOverlayMessage = () => {
    if (hasFailures) {
      return 'Failed to start components. Please retry.';
    }
    if (containerStatus?.healthy && !isSystemHealthy) {
      return 'Containers started. Waiting for services to become ready...';
    }
    if (containerStatus?.running && !containerStatus?.healthy) {
      return 'Containers running. Performing health checks...';
    }
    return 'Please wait while we start the search engine and file extraction components...';
  };

  return (
    <Dialog
      visible={isVisible}
      onHide={() => {}} // Required by PrimeReact even though closable is false
      closable={false}
      dismissableMask={false}
      draggable={false}
      resizable={false}
      modal
      blockScroll
      style={{ width: '600px' }}
      contentStyle={{ backdropFilter: 'blur(8px)' }}
      maskStyle={{ backdropFilter: 'blur(4px)', backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
      header={
        <div className="flex align-items-center gap-3">
          <div className="premium-loader-mini-container">
            <div className="premium-loader-mini-outer"></div>
            <div className="premium-loader-mini-inner"></div>
          </div>
          <span className="font-semibold">Starting Components</span>
        </div>
      }
    >
      <div className="flex flex-column gap-3">
        <p className="text-600 mt-0 mb-3">
          {getOverlayMessage()}
        </p>

        {/* Search Engine Status */}
        {services.search_engine && (
          <ContainerStatusCard
            service={services.search_engine}
            friendlyName="Search Engine"
            icon="fa-search"
            isServiceReady={systemInitialization?.services?.typesense?.status === 'healthy'}
          />
        )}

        {/* File Extractor Status */}
        {services.file_extractor && (
          <ContainerStatusCard
            service={services.file_extractor}
            friendlyName="File Extractor"
            icon="fa-file-alt"
            isServiceReady={systemInitialization?.services?.tika?.status === 'healthy'}
          />
        )}

        {/* Loading state when no services yet */}
        {!containerStatus?.services?.length && !error && (
          <div className="flex align-items-center gap-3 p-3 surface-100 border-round">
            <div className="premium-loader-mini-container">
              <div className="premium-loader-mini-outer"></div>
              <div className="premium-loader-mini-inner"></div>
            </div>
            <span className="text-600 pulse-text">Initializing components...</span>
          </div>
        )}

        {/* Error message */}
        {error && (
          <Message severity="error" text={error} className="w-full" />
        )}

        {/* Retry button */}
        {hasFailures && (
          <Button
            label="Retry Startup"
            icon="fas fa-redo"
            onClick={handleRetry}
            severity="warning"
            className="w-full"
          />
        )}

        {/* Info message */}
        {!hasFailures && containerStatus?.running && !containerStatus?.healthy && (
          <div className="text-sm text-600 text-center">
            <i className="fas fa-info-circle mr-2" />
            Waiting for all components to become healthy...
          </div>
        )}
      </div>
    </Dialog>
  );
}
