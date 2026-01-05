import { useState, useEffect } from 'react';
import { Steps } from 'primereact/steps';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { ProgressBar } from 'primereact/progressbar';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import {
  checkDockerInstallation,
  startDockerServices,
  getDockerStatus,
  createTypesenseCollection,
  getCollectionStatus,
  restartTypesense,
  completeWizard,
  connectDockerPullStream,
  type DockerCheckResult,
  type DockerStatusResult,
  type DockerPullProgress,
} from '../api/client';

interface InitializationWizardProps {
  onComplete: () => void;
}

interface PullState {
  image: string;
  status: string;
  imagePercent: number;
  overallPercent: number;
  progressText: string;
}

export function InitializationWizard({ onComplete }: InitializationWizardProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [dockerCheck, setDockerCheck] = useState<DockerCheckResult | null>(null);
  const [dockerStatus, setDockerStatus] = useState<DockerStatusResult | null>(null);
  const [collectionStatus, setCollectionStatus] = useState<{ exists: boolean; ready: boolean; document_count?: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pullState, setPullState] = useState<PullState | null>(null);
  const [pullLogs, setPullLogs] = useState<string[]>([]);
  const [pullComplete, setPullComplete] = useState(false);
  const [collectionLogs, setCollectionLogs] = useState<string[]>([]);

  const steps = [
    { label: 'Docker Check' },
    { label: 'Pull Images' },
    { label: 'Start Services' },
    { label: 'Create Collection' },
    { label: 'Complete' },
  ];

  // Step 0: Check Docker Installation
  useEffect(() => {
    if (activeStep === 0) {
      checkDocker();
    }
  }, [activeStep]);

  const checkDocker = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await checkDockerInstallation();
      setDockerCheck(result);
      if (result.available) {
        // Auto-proceed to next step if docker is available
        setTimeout(() => setActiveStep(1), 1000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check Docker installation');
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Pull Docker Images with real progress
  const handlePullImages = () => {
    setLoading(true);
    setError(null);
    setPullState(null);
    setPullLogs([]);
    setPullComplete(false);

    console.log('Starting Docker pull...');

    const disconnect = connectDockerPullStream(
      (data: DockerPullProgress) => {
        console.log('Progress event received:', data);
        
        // Add to logs
        const logMessage = data.status || data.message || JSON.stringify(data);
        setPullLogs(prev => [...prev, logMessage]);

        // Update progress state
        setPullState({
          image: data.image || '',
          status: data.status || data.message || '',
          imagePercent: data.image_percent || 0,
          overallPercent: data.overall_percent || 0,
          progressText: data.progress_text || '',
        });

        if (data.complete) {
          console.log('Pull complete!');
          setPullComplete(true);
          setLoading(false);
          setTimeout(() => setActiveStep(2), 1000);
        }
      },
      (errorMsg: string) => {
        console.error('Pull error:', errorMsg);
        setError(errorMsg);
        setLoading(false);
      },
      () => {
        console.log('Pull stream closed');
        setPullComplete(true);
        setLoading(false);
        setTimeout(() => setActiveStep(2), 1000);
      }
    );

    // Cleanup on unmount - store in ref for cleanup
    return () => disconnect();
  };

  // Step 2: Start Docker Services
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
          console.log('===== DOCKER STATUS POLL =====');
          console.log('Status object:', status);
          console.log('status.healthy:', status.healthy);
          console.log('status.running:', status.running);
          console.log('services:', status.services);
          console.log('==============================');
          
          setDockerStatus(status);

          // Auto-proceed after services become healthy
          if (status.healthy) {
            console.log('🎉 Services are healthy! Auto-progressing in 2 seconds...');
            // Clear all intervals
            intervals.forEach(clearInterval);
            setLoading(false);
            // Auto-advance after 2 seconds to show success state
            setTimeout(() => {
              console.log('✅ Auto-progressing to step 3 NOW');
              setActiveStep(3);
            }, 2000);
          } else {
            console.log('⏳ Services not healthy yet, will retry in 2s');
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

  // Step 3: Create Typesense Collection
  const handleCreateCollection = async () => {
    setLoading(true);
    setError(null);
    setCollectionLogs([]);
    let pollInterval: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let logsEventSource: EventSource | null = null;

    // Start logs stream
    try {
      logsEventSource = new EventSource('/api/v1/wizard/typesense-logs');
      logsEventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.log) {
            setCollectionLogs(prev => [...prev.slice(-100), data.log]); // Keep last 100 lines
          }
        } catch (e) {
          console.error('Error parsing log event:', e);
        }
      };
    } catch (e) {
      console.error('Error connecting to logs stream:', e);
    }

    try {
      const result = await createTypesenseCollection();
      if (result.success) {
        // Poll for collection status
        pollInterval = setInterval(async () => {
          const status = await getCollectionStatus();
          setCollectionStatus(status);

          if (status.ready) {
            if (pollInterval) clearInterval(pollInterval);
            if (timeoutId) clearTimeout(timeoutId);
            if (logsEventSource) logsEventSource.close();
            setLoading(false); // Set loading to false here when ready
            setTimeout(() => setActiveStep(4), 1000);
          }
        }, 1500);

        // Timeout after 1 minute
        timeoutId = setTimeout(() => {
          if (pollInterval) {
            clearInterval(pollInterval); // Stop polling
            if (logsEventSource) logsEventSource.close();
            setError('Collection creation timed out. Typesense might not be running or accessible.');
            setLoading(false);
          }
        }, 60000);
      } else {
        if (logsEventSource) logsEventSource.close();
        setError(result.error || 'Failed to create collection');
        setLoading(false);
      }
    } catch (err) {
      if (logsEventSource) logsEventSource.close();
      setError(err instanceof Error ? err.message : 'Failed to create collection');
      setLoading(false);
    }
  };

  // Restart Typesense only (don't auto-trigger collection creation)
  const handleRestartTypesense = async () => {
    setLoading(true);
    setError(null);
    setCollectionStatus(null);

    try {
      const restartResult = await restartTypesense();
      if (!restartResult.success) {
        setError(restartResult.error || 'Failed to restart Typesense');
        setLoading(false);
        return;
      }

      // Wait a bit for Typesense to be ready, then stop loading
      await new Promise(resolve => setTimeout(resolve, 5000));
      setLoading(false);
      // User can manually click "Create Collection" button now
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restart Typesense');
      setLoading(false);
    }
  };

  // Step 4: Complete Wizard
  const handleComplete = async () => {
    setLoading(true);
    setError(null);
    try {
      await completeWizard();
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete wizard');
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
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

      case 1:
        return (
          <div className="flex flex-column gap-3">
            <h3 className="mt-0">Pulling Docker Images</h3>
            <p className="text-600 mt-0">
              Downloading container images for Typesense and Apache Tika. This may take several minutes on first run.
            </p>

            {pullComplete ? (
              <Message severity="success" text="Docker images pulled successfully!" />
            ) : (
              <>
                {loading && pullState && (
                  <>
                    {/* Overall progress bar with real percentage */}
                    <div className="flex flex-column gap-2">
                      <div className="flex justify-content-between align-items-center">
                        <span className="font-semibold">Overall Progress</span>
                        <span className="text-primary font-bold">{pullState.overallPercent}%</span>
                      </div>
                      <ProgressBar value={pullState.overallPercent} showValue={false} />
                    </div>

                    {/* Current image progress */}
                    {pullState.image && (
                      <div className="p-3 surface-100 border-round">
                        <div className="flex flex-column gap-2">
                          <div className="flex align-items-center gap-2">
                            <i className="fas fa-cube text-primary" />
                            <span className="font-semibold text-sm">{pullState.image}</span>
                          </div>
                          <div className="flex justify-content-between align-items-center text-sm">
                            <span className="text-600">{pullState.status}</span>
                            {pullState.imagePercent > 0 && (
                              <span className="text-primary">{pullState.imagePercent}%</span>
                            )}
                          </div>
                          {pullState.imagePercent > 0 && (
                            <ProgressBar value={pullState.imagePercent} showValue={false} style={{ height: '6px' }} />
                          )}
                          {pullState.progressText && (
                            <code className="text-xs text-600">{pullState.progressText}</code>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Logs viewer */}
                    {pullLogs.length > 0 && (
                      <div className="p-3 surface-100 border-round" style={{ maxHeight: '200px', overflow: 'auto' }}>
                        <div className="text-sm font-semibold mb-2 text-600">Pull Logs:</div>
                        <code className="text-xs">
                          {pullLogs.map((log, idx) => (
                            <div key={idx} className="text-600">
                              {log}
                            </div>
                          ))}
                        </code>
                      </div>
                    )}
                  </>
                )}
                {loading && !pullState && (
                  <div className="flex align-items-center gap-2">
                    <i className="fas fa-spinner fa-spin" />
                    <span>Connecting to Docker...</span>
                  </div>
                )}
                {!loading && !pullComplete && (
                  <Button
                    label="Pull Images"
                    icon="fas fa-download"
                    onClick={handlePullImages}
                    size="large"
                  />
                )}
              </>
            )}
            {error && <Message severity="error" text={error} />}
          </div>
        );

      case 2:
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
                  label="Continue to Collection Creation"
                  icon="fas fa-arrow-right"
                  onClick={() => setActiveStep(3)}
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
                {!loading && !dockerStatus && !error && (
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

      case 3:
        return (
          <div className="flex flex-column gap-3">
            <h3 className="mt-0">Creating Search Collection</h3>
            <p className="text-600 mt-0">
              Setting up the Typesense search collection for indexing your files. This includes downloading the embedding
              model if configured.
            </p>

            {collectionStatus?.ready ? (
              <>
                <Message severity="success" text="Collection created successfully!" />
                {collectionStatus.document_count !== undefined && (
                  <div className="text-sm text-600">
                    <strong>Documents:</strong> {collectionStatus.document_count}
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
                  <span>Creating collection...</span>
                </div>

                    {/* Typesense logs viewer */}
                    {collectionLogs.length > 0 && (
                      <div className="p-3 surface-100 border-round" style={{ maxHeight: '300px', overflow: 'auto' }}>
                        <div className="text-sm font-semibold mb-2 text-600">Typesense Container Logs:</div>
                        <code className="text-xs">
                          {collectionLogs.map((log, idx) => (
                            <div key={idx} className="text-600" style={{ fontFamily: 'monospace' }}>
                              {log}
                            </div>
                          ))}
                        </code>
                      </div>
                    )}
                  </>
                )}
                {!loading && !collectionStatus && !error && (
                  <Button
                    label="Create Collection"
                    icon="fas fa-database"
                    onClick={handleCreateCollection}
                    size="large"
                  />
                )}
                {!loading && error && (
                  <div className="flex flex-column gap-2">
                    <Message severity="error" text={error} />
                    <Button
                      label="Restart Typesense"
                      icon="fas fa-redo"
                      onClick={handleRestartTypesense}
                      severity="warning"
                      size="large"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        );

      case 4:
        return (
          <div className="flex flex-column gap-3 align-items-center text-center">
            <i className="fas fa-check-circle text-6xl text-green-500" />
            <h2 className="mt-0">Initialization Complete!</h2>
            <p className="text-600 mt-0 mb-4">
              All services are ready. You can now start using File Brain to index and search your files.
            </p>
            <Button
              label="Start Using File Brain"
              icon="fas fa-arrow-right"
              onClick={handleComplete}
              size="large"
              loading={loading}
            />
            {error && <Message severity="error" text={error} className="w-full" />}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed top-0 left-0 w-full h-full z-5 flex align-items-center justify-content-center surface-ground">
      <Card
        className="shadow-4 border-round-2xl"
        style={{ width: '800px', maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto' }}
      >
        <div className="text-center mb-4">
          <i className="fas fa-bolt text-5xl text-primary mb-3" />
          <h1 className="text-3xl font-bold m-0 text-900 mb-2">File Brain Setup</h1>
          <p className="text-600 m-0">Let's get your system ready for intelligent file search</p>
        </div>

        <Steps model={steps} activeIndex={activeStep} className="mb-5" />

        <div className="mt-4">{renderStepContent()}</div>
      </Card>
    </div>
  );
}
