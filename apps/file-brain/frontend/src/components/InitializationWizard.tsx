import { useState, useEffect, useCallback } from 'react';
import { Steps } from 'primereact/steps';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { ProgressBar } from 'primereact/progressbar';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { confirmDialog, ConfirmDialog } from 'primereact/confirmdialog';
import {
  checkDockerInstallation,
  startDockerServices,
  getDockerStatus,
  createTypesenseCollection,
  getCollectionStatus,
  restartTypesense,
  completeWizard,
  connectDockerPullStream,
  connectCollectionLogsStream,
  getModelStatus,
  connectModelDownloadStream,
  type DockerCheckResult,
  type DockerStatusResult,
  type DockerPullProgress,
  type ModelStatusResult,
  type ModelDownloadProgress,
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

// Helper function to format bytes to human-readable string
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
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
  
  // Model download state
  const [modelStatus, setModelStatus] = useState<ModelStatusResult | null>(null);
  const [modelDownloadProgress, setModelDownloadProgress] = useState<ModelDownloadProgress | null>(null);
  const [modelDownloadComplete, setModelDownloadComplete] = useState(false);

  const steps = [
    { label: 'Docker Check' },
    { label: 'Pull Images' },
    { label: 'Start Services' },
    { label: 'Download Model' },
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
  
  const checkImages = useCallback(async () => {
     // Only check if we haven't already completed pulling (to avoid double skipping or issues)
     if (pullComplete) return;

     setLoading(true);
     try {
       const { checkDockerImages } = await import('../api/client');
       const result = await checkDockerImages();
       
       if (result.success && result.all_present) {
          setPullState({
            image: '',
            status: 'Images found locally',
            imagePercent: 100,
            overallPercent: 100,
            progressText: 'All required images are already present on this system.',
          });
          setPullComplete(true);
          setLoading(false);
          // Auto-advance to Start Services step
          setTimeout(() => setActiveStep(2), 1500);
       } else {
         // Images missing, wait for user to click pull
         setLoading(false);
       }
     } catch {
       setLoading(false);
     }
  }, [pullComplete]);

  // Check for existing images when step 1 becomes active
  useEffect(() => {
    if (activeStep === 1) {
      checkImages();
    }
  }, [activeStep, checkImages]);

  const handlePullImages = () => {
    setLoading(true);
    setError(null);
    setPullState(null);
    setPullLogs([]);
    setPullComplete(false);

    const disconnect = connectDockerPullStream(
      (data: DockerPullProgress) => {
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
          setPullComplete(true);
          setLoading(false);
          setTimeout(() => setActiveStep(2), 1000);
        }
      },
      (errorMsg: string) => {
        setError(errorMsg);
        setLoading(false);
      },
      () => {
        setPullComplete(true);
        setLoading(false);
        setTimeout(() => setActiveStep(2), 1000);
      }
    );

    // Cleanup on unmount - store in ref for cleanup
    return () => disconnect();
  };

  // Step 2: Start Docker Services

  const checkExistingServices = useCallback(async () => {
    // Avoid re-checking if we already know it's healthy
    if (dockerStatus?.healthy) return;

    setLoading(true);
    try {
      const status = await getDockerStatus();
      setDockerStatus(status);
      
      if (status.healthy) {
        setLoading(false);
        setTimeout(() => setActiveStep(3), 1500);
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }, [dockerStatus?.healthy]);

  useEffect(() => {
    if (activeStep === 2) {
      checkExistingServices();
    }
  }, [activeStep, checkExistingServices]);

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
              setActiveStep(3);
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

  // Step 3: Create Typesense Collection
  
  const [resetting, setResetting] = useState(false);

  // Step 3: Download Embedding Model
  
  const checkExistingModel = useCallback(async () => {
    if (modelDownloadComplete) return;

    setLoading(true);
    try {
      const status = await getModelStatus();
      setModelStatus(status);
      
      if (status.exists) {
        setModelDownloadComplete(true);
        setLoading(false);
        setTimeout(() => setActiveStep(4), 1500);
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }, [modelDownloadComplete]);

  useEffect(() => {
    if (activeStep === 3) {
      checkExistingModel();
    }
  }, [activeStep, checkExistingModel]);

  const handleDownloadModel = () => {
    setLoading(true);
    setError(null);
    // Set initial progress immediately to show "Connecting..." in UI
    setModelDownloadProgress({
      status: 'connecting',
      message: 'Connecting to HuggingFace...',
      progress_percent: 0,
    });
    setModelDownloadComplete(false);

    const disconnect = connectModelDownloadStream(
      (data: ModelDownloadProgress) => {
        setModelDownloadProgress(data);

        if (data.complete) {
          setModelDownloadComplete(true);
          setLoading(false);
          setTimeout(() => setActiveStep(4), 1000);
        }
      },
      (errorMsg: string) => {
        setError(errorMsg);
        setLoading(false);
      },
      () => {
        setModelDownloadComplete(true);
        setLoading(false);
        setTimeout(() => setActiveStep(4), 1000);
      }
    );

    // Cleanup on unmount
    return () => disconnect();
  };

  // Step 4: Create Typesense Collection
  
  const checkExistingCollection = useCallback(async () => {
    // If we already know the status, don't re-fetch unless force check needed
    // Also protect against race conditions if we are currently loading/resetting
    if (collectionStatus || loading || resetting) return;

    setLoading(true);
    try {
      const status = await getCollectionStatus();
      setCollectionStatus(status);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [collectionStatus, loading, resetting]);

  useEffect(() => {
    if (activeStep === 4) {
      checkExistingCollection();
    }
  }, [activeStep, checkExistingCollection]);

  const handleCreateCollection = async () => {
    setLoading(true);
    setError(null);
    setCollectionLogs([]);
    let pollInterval: NodeJS.Timeout | null = null;
    let logsEventSource: (() => void) | null = null;

    // Connect to collection logs stream FIRST
    try {
      logsEventSource = connectCollectionLogsStream(
        (log) => {
          setCollectionLogs(prev => [...prev.slice(-100), log]);
        },
        () => {
          // Stream completed
        },
        () => {
          // Log stream error
        }
      );
    } catch {
      // Error connecting to logs stream
    }

    try {
      // Now trigger collection creation (non-blocking)
      const result = await createTypesenseCollection();
      if (result.success) {
        // Poll for collection status (no timeout - let it run until complete)
        pollInterval = setInterval(async () => {
          const status = await getCollectionStatus();
          setCollectionStatus(status);

          if (status.ready) {
            if (pollInterval) clearInterval(pollInterval);
            if (logsEventSource) logsEventSource();
            setLoading(false);
            setTimeout(() => setActiveStep(5), 1000);
          }
        }, 1500);
      } else {
        if (logsEventSource) logsEventSource();
        setError(result.error || 'Failed to create collection');
        setLoading(false);
      }
    } catch (err) {
      if (logsEventSource) logsEventSource();
      setError(err instanceof Error ? err.message : 'Failed to create collection');
      setLoading(false);
    }
  };

  const handleStopCollectionCreation = () => {
    setLoading(false);
    setError('Collection creation stopped by user');
  };

  const handleResetCollection = () => {
    confirmDialog({
        message: 'Are you sure you want to reset the collection? This will DELETE all indexed data and start with a fresh index.',
        header: 'Reset & Delete Data',
        icon: 'fas fa-exclamation-triangle',
        acceptClassName: 'p-button-warning',
        rejectClassName: 'p-button-secondary',
        acceptIcon: 'fas fa-trash',
        rejectIcon: 'fas fa-times',
        defaultFocus: 'reject',
        accept: async () => {
            setLoading(true);
            setResetting(true);
            setError(null);
            setCollectionStatus(null);
            
            try {
                // First restart/wipe typesense
                const restartResult = await restartTypesense();
                if (!restartResult.success) {
                   throw new Error(restartResult.error || 'Failed to restart Typesense');
                }
                
                // Wait for it to come back up slightly
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // Then trigger creation
                await handleCreateCollection();

            } catch (err) {
                 setError(err instanceof Error ? err.message : 'Failed to reset collection');
                 setLoading(false);
            } finally {
                 setResetting(false);
            }
        }
    });
  };

  // Step 5: Complete Wizard
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
                        <span className="text-primary font-bold">{(pullState.overallPercent || 0).toFixed(2)}%</span>
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
                              <span className="text-primary">{(pullState.imagePercent || 0).toFixed(2)}%</span>
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

      case 3:
        return (
          <div className="flex flex-column gap-3">
            <h3 className="mt-0">Downloading Embedding Model</h3>
            <p className="text-600 mt-0">
              Downloading the AI embedding model from HuggingFace. This enables semantic search capabilities.
              The model is approximately 1.1 GB.
            </p>

            {modelDownloadComplete ? (
              <Message severity="success" text="Embedding model downloaded successfully!" />
            ) : (
              <>
                {loading && modelDownloadProgress && (
                  <>
                    {/* Overall progress bar */}
                    <div className="flex flex-column gap-2">
                      <div className="flex justify-content-between align-items-center">
                        <span className="font-semibold">Overall Progress</span>
                        <span className="text-primary font-bold">{(modelDownloadProgress.progress_percent || 0).toFixed(2)}%</span>
                      </div>
                      <ProgressBar value={modelDownloadProgress.progress_percent || 0} showValue={false} />
                      {modelDownloadProgress.total_size && (
                        <div className="text-xs text-500">
                          {formatBytes(modelDownloadProgress.total_downloaded || 0)} / {formatBytes(modelDownloadProgress.total_size)}
                        </div>
                      )}
                    </div>

                    {/* Current file info with file-level progress */}
                    {modelDownloadProgress.file && (
                      <div className="p-3 surface-100 border-round">
                        <div className="flex justify-content-between align-items-center">
                          <div className="flex align-items-center gap-2">
                            <i className="fas fa-file text-primary" />
                            <span className="font-semibold text-sm">{modelDownloadProgress.file}</span>
                          </div>
                          <span className="text-sm text-primary font-bold">{(modelDownloadProgress.file_percent || 0).toFixed(2)}%</span>
                        </div>
                        {modelDownloadProgress.file_total && (
                          <div className="mt-2">
                            <ProgressBar value={modelDownloadProgress.file_percent || 0} showValue={false} style={{ height: '6px' }} />
                            <div className="text-xs text-500 mt-1">
                              {formatBytes(modelDownloadProgress.file_downloaded || 0)} / {formatBytes(modelDownloadProgress.file_total)}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Status message */}
                    {modelDownloadProgress.message && !modelDownloadProgress.file && (
                      <div className="flex align-items-center gap-2 text-sm text-600">
                        <i className="fas fa-spinner fa-spin" />
                        <span>{modelDownloadProgress.message}</span>
                      </div>
                    )}
                  </>
                )}
                {loading && !modelDownloadProgress && (
                  <div className="flex align-items-center gap-2">
                    <i className="fas fa-spinner fa-spin" />
                    <span>Checking model status...</span>
                  </div>
                )}
                {!loading && !modelDownloadComplete && modelStatus?.exists && (
                  <>
                    <Message severity="success" text="Model already downloaded!" />
                    <Button
                      label="Continue"
                      icon="fas fa-arrow-right"
                      onClick={() => setActiveStep(4)}
                      size="large"
                    />
                  </>
                )}
                {!loading && !modelDownloadComplete && !modelStatus?.exists && (
                  <Button
                    label="Download Model"
                    icon="fas fa-download"
                    onClick={handleDownloadModel}
                    size="large"
                  />
                )}
              </>
            )}
            {error && <Message severity="error" text={error} />}
          </div>
        );

      case 4:
        return (
          <div className="flex flex-column gap-3">
            <h3 className="mt-0">Creating Search Collection</h3>
            <p className="text-600 mt-0">
              Setting up the Typesense search collection for indexing your files.
            </p>

            {collectionStatus?.ready || collectionStatus?.exists ? (
              <>
                <Message severity="success" text="A search collection already exists." />
                {collectionStatus.document_count !== undefined && (
                  <div className="text-sm text-600 mb-2">
                    <strong>Current Document Count:</strong> {collectionStatus.document_count}
                  </div>
                )}
                <div className="flex gap-3 justify-content-end">
                    <Button
                      label="Reset & Re-create"
                      icon="fas fa-redo"
                      onClick={handleResetCollection}
                      severity="warning"
                      outlined
                    />
                     <Button
                      label="Skip & Continue"
                      icon="fas fa-arrow-right"
                      onClick={() => setActiveStep(5)}
                    />
                </div>
              </>
            ) : (
              <>
                {loading && (
              <>
                <ProgressBar mode="indeterminate" />
                <div className="flex align-items-center gap-2 text-sm text-600">
                  <i className="fas fa-spinner fa-spin" />
                  <span>{resetting ? 'Resetting & Re-creating collection...' : 'Creating collection...'}</span>
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

                    {/* Stop button during creation */}
                    <div className="flex gap-2 mt-3">
                      <Button
                        label="Stop Creation"
                        icon="fas fa-stop"
                        onClick={handleStopCollectionCreation}
                        severity="secondary"
                        outlined
                      />
                      <div className="text-sm text-600 flex align-items-center">
                        <i className="fas fa-info-circle mr-2" />
                        Model downloads can take 5-10 minutes. Check logs for progress.
                      </div>
                    </div>
                  </>
                )}
                {!loading && !error && (
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
                      label="Retry Creation"
                      icon="fas fa-redo"
                      onClick={handleCreateCollection}
                      size="large"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        );

      case 5:
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

        <ConfirmDialog />
        <div className="mt-4">{renderStepContent()}</div>
      </Card>
    </div>
  );
}
