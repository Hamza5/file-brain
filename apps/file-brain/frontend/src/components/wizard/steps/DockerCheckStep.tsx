import React, { useEffect, useState, useCallback } from 'react';
import { Message } from 'primereact/message';
import { Button } from 'primereact/button';
import { checkDockerInstallation, type DockerCheckResult } from '../../../api/client';

interface DockerCheckStepProps {
  onComplete: () => void;
}

// Detect user's platform
const detectPlatform = (): 'Windows' | 'macOS' | 'Linux' => {
  const userAgent = window.navigator.userAgent.toLowerCase();
  if (userAgent.includes('win')) return 'Windows';
  if (userAgent.includes('mac')) return 'macOS';
  return 'Linux';
};

export const DockerCheckStep: React.FC<DockerCheckStepProps> = ({ onComplete }) => {
  const [dockerCheck, setDockerCheck] = useState<DockerCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const platform = detectPlatform();

  const checkDocker = useCallback(async () => {
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
  }, [onComplete]);

  useEffect(() => {
    checkDocker();
  }, [checkDocker]);

  // Platform-specific installation info
  const dockerDownloadLink = platform === 'Windows' 
    ? 'https://docs.docker.com/desktop/install/windows-install/'
    : platform === 'macOS'
    ? 'https://docs.docker.com/desktop/install/mac-install/'
    : 'https://docs.docker.com/desktop/install/linux-install/';

  const podmanDownloadLink = platform === 'Windows'
    ? 'https://podman.io/docs/installation#windows'
    : platform === 'macOS'
    ? 'https://podman.io/docs/installation#macos'
    : 'https://podman.io/docs/installation';

  return (
    <div className="flex flex-column gap-3">
      <h3 className="mt-0">Checking System Requirements</h3>
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
                className="text-lg"
                text={
                  <div className="flex flex-column gap-2">
                    <div className="text-xl font-bold">
                      <i className="fas fa-exclamation-triangle mr-2" />
                      Docker or Podman Required
                    </div>
                    <div>
                      File Brain requires Docker or Podman to run its search engine and document processing components.
                      Please install one of them to continue.
                    </div>
                  </div>
                }
              />
              <div className="p-4 surface-100 border-round mt-2">
                <h4 className="mt-0 mb-3">
                  <i className="fas fa-download mr-2" />
                  Installation Options for {platform}
                </h4>
                
                <div className="flex flex-column gap-3">
                  <div>
                    <div className="font-bold mb-2 text-lg">
                      <i className="fab fa-docker mr-2 text-blue-500" />
                      Docker Desktop (Recommended)
                    </div>
                    <p className="mt-0 mb-2 text-sm">
                      Docker Desktop is the easiest way to get started. It includes Docker Engine and all necessary tools.
                    </p>
                    <Button
                      label={`Download Docker for ${platform}`}
                      icon="fas fa-external-link-alt"
                      className="p-button-outlined"
                      onClick={() => window.open(dockerDownloadLink, '_blank')}
                    />
                  </div>

                  <div className="border-top-1 surface-border pt-3">
                    <div className="font-bold mb-2 text-lg">
                      <i className="fas fa-cube mr-2 text-purple-500" />
                      Podman (Alternative)
                    </div>
                    <p className="mt-0 mb-2 text-sm">
                      Podman is a lightweight alternative to Docker that works without requiring elevated privileges.
                    </p>
                    <Button
                      label={`Download Podman for ${platform}`}
                      icon="fas fa-external-link-alt"
                      className="p-button-outlined"
                      onClick={() => window.open(podmanDownloadLink, '_blank')}
                    />
                  </div>
                </div>

                <div className="mt-4 p-3 bg-blue-50 border-round">
                  <div className="flex align-items-start gap-2">
                    <i className="fas fa-info-circle text-blue-600 mt-1" />
                    <div className="text-sm">
                      <strong>After installation:</strong> {platform === 'Windows' ? 'Restart your computer, then' : 'Close and'} reopen File Brain to continue setup.
                    </div>
                  </div>
                </div>
              </div>
              <Button 
                label="Retry Check" 
                icon="fas fa-sync" 
                onClick={checkDocker} 
                className="mt-2" 
                severity="secondary"
              />
            </>
          )}
        </div>
      )}
      {error && <Message severity="error" text={error} />}
    </div>
  );
};
