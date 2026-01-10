import React, { useCallback, useEffect, useState } from 'react';
import { Message } from 'primereact/message';
import { Button } from 'primereact/button';
import { ProgressBar } from 'primereact/progressbar';
import { Tag } from 'primereact/tag';
import { startDockerServices, getDockerStatus, type DockerStatusResult } from '../../../api/client';

interface ServiceStartStepProps {
  onComplete: () => void;
}

export const ServiceStartStep: React.FC<ServiceStartStepProps> = ({ onComplete }) => {
  const [dockerStatus, setDockerStatus] = useState<DockerStatusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkExistingServices = useCallback(async () => {
    // Avoid re-checking if we already know it's healthy
    if (dockerStatus?.healthy) return;

    setLoading(true);
    try {
      const status = await getDockerStatus();
      setDockerStatus(status);
      
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
    const intervals: NodeJS.Timeout[] = [];

    try {
      const result = await startDockerServices();
      if (result.success) {
        // Poll for docker status
        const pollInterval = setInterval(async () => {
          const status = await getDockerStatus();
          setDockerStatus(status);

          // Auto-proceed after services become healthy
          if (status.healthy) {
            intervals.forEach(clearInterval);
            setLoading(false);
            setTimeout(() => {
              onComplete();
            }, 2000);
          }
        }, 2000);
        intervals.push(pollInterval);

        // Timeout after 2 minutes
        const timeoutId = setTimeout(() => {
          intervals.forEach(clearInterval);
          if (!dockerStatus?.running) {
            setError('Docker services failed to start within timeout. Try restarting.');
            setLoading(false);
          }
        }, 120000);
        intervals.push(timeoutId as unknown as NodeJS.Timeout);
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
      <h3 className="mt-0">Starting Docker Services</h3>
      <p className="text-600 mt-0">
        Starting the Typesense search engine and Apache Tika content extractor containers.
      </p>

      {dockerStatus?.running ? (
        <>
          <Message 
            severity={dockerStatus.healthy ? "success" : "warn"} 
            text={dockerStatus.healthy ? "All services are healthy!" : "Services are running but not all are healthy yet..."}
          />
          <div className="flex flex-column gap-2">
            {dockerStatus.services.map((service) => (
              <div key={service.name} className="flex justify-content-between align-items-center p-2 surface-100 border-round">
                <div className="flex flex-column">
                  <span className="font-semibold">{service.service}</span>
                  <span className="text-sm text-600">{service.name}</span>
                </div>
                <div className="flex gap-2">
                  <Tag
                    value={service.state}
                    severity={service.state === 'running' ? 'success' : 'warning'}
                    icon={service.state === 'running' ? 'fas fa-check' : 'fas fa-spinner fa-spin'}
                  />
                  {service.health && service.health !== '' && (
                    <Tag
                      value={service.health}
                      severity={service.health === 'healthy' ? 'success' : service.health === 'starting' ? 'info' : 'danger'}
                      icon={service.health === 'healthy' ? 'fas fa-heartbeat' : 'fas fa-exclamation-triangle'}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
          <Button
            label="Continue to Model Download"
            icon="fas fa-arrow-right"
            onClick={onComplete}
            size="large"
            disabled={!dockerStatus.healthy}
            severity={dockerStatus.healthy ? "success" : "secondary"}
          />
          {!dockerStatus.healthy && (
            <div className="text-sm text-600 text-center">
              <i className="fas fa-info-circle mr-2" />
              Waiting for all containers to become healthy before proceeding...
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
                <span>Starting containers...</span>
              </div>
            </>
          )}
          {!loading && !error && (
            <Button
              label="Start Docker Services"
              icon="fas fa-play"
              onClick={handleStartDockerServices}
              size="large"
            />
          )}
          {!loading && error && (
            <Button
              label="Restart Docker Services"
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
