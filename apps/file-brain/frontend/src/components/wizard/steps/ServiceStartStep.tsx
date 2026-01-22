import React, { useCallback, useEffect, useState } from 'react';
import { Message } from 'primereact/message';
import { Button } from 'primereact/button';
import { ProgressBar } from 'primereact/progressbar';
import { Tag } from 'primereact/tag';
import { startDockerServices, getDockerStatus, connectAppContainerStatusStream, type AppContainerStatus } from '../../../api/client';

interface ServiceStartStepProps {
  onComplete: () => void;
}

export const ServiceStartStep: React.FC<ServiceStartStepProps> = ({ onComplete }) => {
  const [dockerStatus, setDockerStatus] = useState<AppContainerStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkExistingServices = useCallback(async () => {
    // Avoid re-checking if we already know it's healthy
    if (dockerStatus?.healthy) return;

    setLoading(true);
    try {
      const status = await getDockerStatus();
      setDockerStatus({ ...status, timestamp: Date.now() });
      
      if (status.healthy) {
        setLoading(false);
        setTimeout(() => onComplete(), 1500);
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }, [dockerStatus?.healthy, onComplete]);

  useEffect(() => {
    checkExistingServices();
  }, [checkExistingServices]);

  const handleStartDockerServices = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await startDockerServices();
      if (result.success) {
        // Use SSE stream instead of polling
        connectAppContainerStatusStream(
          (status) => {
            setDockerStatus(status);
            
            // Clear error if we're retrying (show as warning instead)
            if (status.error && status.retrying) {
              setError(null);  // Don't show as fatal error
            }
            
            // Auto-proceed after services become healthy
            if (status.healthy) {
              setLoading(false);
              setTimeout(() => {
                onComplete();
              }, 2000);
            }
          },
          (err) => {
            // Fatal error (non-retrying)
            setError(err);
            setLoading(false);
          },
          () => {
            // Completion callback - containers are healthy
            setLoading(false);
          }
        );

      } else {
        setError(result.error || 'Failed to start Docker services');
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Docker services');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-column gap-3">
      <h3 className="mt-0">Initializing Search Engine</h3>
      <p className="text-600 mt-0">
        Starting the search and file extraction engine.
      </p>

      {dockerStatus?.running ? (
        <>
          <Message 
            severity={dockerStatus.healthy ? "success" : "warn"} 
            text={dockerStatus.healthy ? "All components are ready!" : "Engine is starting, but some components are still warming up..."}
          />
          <div className="flex flex-column gap-2">
            {dockerStatus.services.map((service) => (
              <div key={service.name} className="flex justify-content-between align-items-center p-2 surface-100 border-round">
                <div className="flex flex-column">
                  <span className="font-semibold">{service.service.includes('typesense') ? 'Search Core' : 'File Processor'}</span>
                  <span className="text-sm text-600">{service.name}</span>
                </div>
                <div className="flex gap-2">
                  <Tag
                    value={service.state === 'running' ? 'Active' : service.state}
                    severity={service.state === 'running' ? 'success' : 'warning'}
                    icon={service.state === 'running' ? 'fas fa-check' : 'fas fa-spinner fa-spin'}
                  />
                  {service.health && service.health !== '' && (
                    <Tag
                      value={service.health === 'healthy' ? 'Healthy' : service.health}
                      severity={service.health === 'healthy' ? 'success' : service.health === 'starting' ? 'info' : 'danger'}
                      icon={service.health === 'healthy' ? 'fas fa-heartbeat' : 'fas fa-exclamation-triangle'}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
          <Button
            label="Continue to Embedding (AI) Model"
            icon="fas fa-arrow-right"
            onClick={onComplete}
            size="large"
            disabled={!dockerStatus.healthy}
            severity={dockerStatus.healthy ? "success" : "secondary"}
          />
          {!dockerStatus.healthy && (
            <div className="text-sm text-600 text-center">
              <i className="fas fa-info-circle mr-2" />
              Waiting for all components to become ready before proceeding...
              {dockerStatus.check_count !== undefined && dockerStatus.check_count > 5 && (
                <div className="mt-2 text-xs">
                  (Health check attempt {dockerStatus.check_count + 1})
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {loading && (
            <>
              <ProgressBar mode="indeterminate" />
              <div className="flex align-items-center gap-2 text-sm text-600">
                <i className="fas fa-spinner fa-spin" />
                <span>Starting engine...</span>
              </div>
            </>
          )}
          {!loading && !error && (
            <Button
              label="Start Search Engine"
              icon="fas fa-play"
              onClick={handleStartDockerServices}
              size="large"
            />
          )}
          {!loading && error && (
            <Button
              label="Restart Search Engine"
              icon="fas fa-redo"
              onClick={handleStartDockerServices}
              size="large"
              severity="warning"
            />
          )}
        </>
      )}

      {error && <Message severity="error" text={error} />}
    </div>
  );
};
