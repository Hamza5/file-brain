import React, { useCallback, useEffect, useState } from 'react';
import { Message } from 'primereact/message';
import { Button } from 'primereact/button';
import { ProgressBar } from 'primereact/progressbar';
import { formatBytes } from '../../../utils/fileUtils';
import { getModelStatus, connectModelDownloadStream, type ModelStatusResult, type ModelDownloadProgress } from '../../../api/client';

interface ModelDownloadStepProps {
  onComplete: () => void;
}

export const ModelDownloadStep: React.FC<ModelDownloadStepProps> = ({ onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatusResult | null>(null);
  const [modelDownloadProgress, setModelDownloadProgress] = useState<ModelDownloadProgress | null>(null);
  const [modelDownloadComplete, setModelDownloadComplete] = useState(false);

  const checkExistingModel = useCallback(async () => {
    if (modelDownloadComplete) return;

    setLoading(true);
    try {
      const status = await getModelStatus();
      setModelStatus(status);
      
      if (status.exists) {
        setModelDownloadComplete(true);
        setLoading(false);
        setTimeout(() => onComplete(), 1500);
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }, [modelDownloadComplete, onComplete]);

  useEffect(() => {
    checkExistingModel();
  }, [checkExistingModel]);

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
          setTimeout(() => onComplete(), 1000);
        }
      },
      (errorMsg: string) => {
        setError(errorMsg);
        setLoading(false);
      },
      () => {
        setModelDownloadComplete(true);
        setLoading(false);
        setTimeout(() => onComplete(), 1000);
      }
    );

    // Cleanup on unmount
    return () => disconnect();
  };

  return (
    <div className="flex flex-column gap-3">
      <h3 className="mt-0">Downloading Embedding (AI) Search Model</h3>
      <p className="text-600 mt-0">
        Downloading the embedding (AI) model that enables intelligent natural-language search. This model processes your files locally to understand their meaning.
        (Approx. 1.1 GB)
      </p>

      <Message 
        severity="info" 
        text="The download may appear to pause at times or make quick jumps while the model components are being finalized. Please be patient." 
        className="w-full justify-content-start"
      />

      {modelDownloadComplete ? (
        <Message severity="success" text="Embedding (AI) Search model downloaded successfully!" />
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

              {/* Current component info with component-level progress */}
              {modelDownloadProgress.file && (
                <div className="p-3 surface-100 border-round">
                  <div className="flex justify-content-between align-items-center">
                    <div className="flex align-items-center gap-2">
                      <i className="fas fa-file text-primary" />
                      <span className="font-semibold text-sm">Component: {modelDownloadProgress.file}</span>
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
              <span>Initializing download...</span>
            </div>
          )}
          {!loading && !modelDownloadComplete && modelStatus?.exists && (
            <>
              <Message severity="success" text="Embedding (AI) model already downloaded!" />
              <Button
                label="Continue"
                icon="fas fa-arrow-right"
                onClick={onComplete}
                size="large"
              />
            </>
          )}
          {!loading && !modelDownloadComplete && !modelStatus?.exists && (
            <Button
              label="Download Embedding (AI) Model"
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
};
