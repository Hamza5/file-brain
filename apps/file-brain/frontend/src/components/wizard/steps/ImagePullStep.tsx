import React, { useCallback, useEffect, useState } from 'react';
import { Message } from 'primereact/message';
import { Button } from 'primereact/button';
import { ProgressBar } from 'primereact/progressbar';
import { connectDockerPullStream, type DockerPullProgress } from '../../../api/client';
import { usePostHog } from '../../../context/PostHogProvider';

interface ImagePullStepProps {
  onComplete: () => void;
}

interface PullState {
  image: string;
  status: string;
  imagePercent: number;
  overallPercent: number;
  progressText: string;
}

export const ImagePullStep: React.FC<ImagePullStepProps> = ({ onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pullState, setPullState] = useState<PullState | null>(null);
  const [pullLogs, setPullLogs] = useState<string[]>([]);
  const [pullComplete, setPullComplete] = useState(false);
  const posthog = usePostHog();

  const checkImages = useCallback(async () => {
    if (pullComplete) return;

    setLoading(true);
    try {
      const { checkDockerImages } = await import('../../../api/client');
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
        // Auto-advance to next step
        setTimeout(() => onComplete(), 1500);
      } else {
        // Images missing, wait for user to click pull
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }, [pullComplete, onComplete]);

  useEffect(() => {
    checkImages();
  }, [checkImages]);

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
          setTimeout(() => onComplete(), 1000);
        }
      },
      (errorMsg: string) => {
        setError(errorMsg);
        setLoading(false);
        if (posthog) {
          posthog.capture('wizard_error', {
            step_name: 'Image Pull',
            error_message: errorMsg
          });
        }
      },
      () => {
        setPullComplete(true);
        setLoading(false);
        setTimeout(() => onComplete(), 1000);
      }
    );

    // Cleanup on unmount
    return () => disconnect();
  };

  return (
    <div className="flex flex-column gap-3">
      <h3 className="mt-0">Downloading Components</h3>
      <p className="text-600 mt-0">
        Downloading essential components for search and file extraction. This may take several minutes on first run.
      </p>

      <Message 
        severity="info" 
        text="Progress is estimated and may occasionally fluctuate as new components are discovered. This is normal behavior." 
        className="w-full justify-content-start"
      />

      {pullComplete ? (
        <Message severity="success" text="Components downloaded successfully!" />
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

              {/* Current component progress */}
              {pullState.image && (
                <div className="p-3 surface-100 border-round">
                  <div className="flex flex-column gap-2">
                    <div className="flex align-items-center gap-2">
                      <i className="fas fa-cube text-primary" />
                      <span className="font-semibold text-sm">Component: {pullState.image}</span>
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
                  <div className="text-sm font-semibold mb-2 text-600">Download Logs:</div>
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
              <span>Connecting...</span>
            </div>
          )}
          {!loading && !pullComplete && (
            <Button
              label="Download Components"
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
};
