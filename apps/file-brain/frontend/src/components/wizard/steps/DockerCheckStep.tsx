import React, { useEffect, useState } from 'react';
import { Message } from 'primereact/message';
import { Button } from 'primereact/button';
import { checkDockerInstallation, type DockerCheckResult } from '../../../api/client';

interface DockerCheckStepProps {
  onComplete: () => void;
}

export const DockerCheckStep: React.FC<DockerCheckStepProps> = ({ onComplete }) => {
  const [dockerCheck, setDockerCheck] = useState<DockerCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkDocker();
  }, []);

  const checkDocker = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await checkDockerInstallation();
      setDockerCheck(result);
      if (result.available) {
        // Auto-proceed to next step if docker is available
        setTimeout(() => onComplete(), 1000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check Docker installation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-column gap-3">
      <h3 className="mt-0">Checking Docker Installation</h3>
      {loading && (
        <div className="flex align-items-center gap-2">
          <i className="fas fa-spinner fa-spin" />
          <span>Checking for Docker or Podman...</span>
        </div>
      )}
      {dockerCheck && (
        <div className="flex flex-column gap-2">
          {dockerCheck.available ? (
            <>
              <Message severity="success" text="Docker/Podman is installed and ready!" />
              <div className="flex flex-column gap-1 text-sm">
                <div>
                  <strong>Command:</strong> {dockerCheck.command}
                </div>
                <div>
                  <strong>Version:</strong> {dockerCheck.version}
                </div>
              </div>
            </>
          ) : (
            <>
              <Message
                severity="error"
                text="Docker/Podman not found. Please install Docker or Podman to continue."
              />
              <div className="p-3 surface-100 border-round">
                <h4 className="mt-0">Installation Instructions:</h4>
                <p className="mb-2">
                  <strong>Docker:</strong> Visit{' '}
                  <a href="https://docs.docker.com/get-docker/" target="_blank" rel="noopener noreferrer">
                    https://docs.docker.com/get-docker/
                  </a>
                </p>
                <p className="mb-0">
                  <strong>Podman:</strong> Visit{' '}
                  <a href="https://podman.io/docs/installation" target="_blank" rel="noopener noreferrer">
                    https://podman.io/docs/installation
                  </a>
                </p>
              </div>
              <Button label="Retry Check" icon="fas fa-sync" onClick={checkDocker} className="mt-2" />
            </>
          )}
        </div>
      )}
      {error && <Message severity="error" text={error} />}
    </div>
  );
};
