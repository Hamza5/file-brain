import React, { useCallback, useEffect, useState } from 'react';
import { Message } from 'primereact/message';
import { Button } from 'primereact/button';
import { ProgressBar } from 'primereact/progressbar';
import { confirmDialog } from 'primereact/confirmdialog';
import { createTypesenseCollection, getCollectionStatus, restartTypesense, connectCollectionLogsStream } from '../../../api/client';

interface CollectionCreateStepProps {
  onComplete: () => void;
}

export const CollectionCreateStep: React.FC<CollectionCreateStepProps> = ({ onComplete }) => {
  const [collectionStatus, setCollectionStatus] = useState<{ exists: boolean; ready: boolean; document_count?: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collectionLogs, setCollectionLogs] = useState<string[]>([]);
  const [resetting, setResetting] = useState(false);

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
    checkExistingCollection();
  }, [checkExistingCollection]);

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
            setTimeout(() => onComplete(), 1000);
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

  return (
    <div className="flex flex-column gap-3">
      <h3 className="mt-0">Finalizing Search Engine</h3>
      <p className="text-600 mt-0">
        Setting up the search database to store and index your file information.
      </p>

      {collectionStatus?.ready || collectionStatus?.exists ? (
        <>
          <Message severity="success" text="Search database is ready." />
          {collectionStatus.document_count !== undefined && (
            <div className="text-sm text-600 mb-2">
              <strong>Indexed Files:</strong> {collectionStatus.document_count}
            </div>
          )}
          <div className="flex gap-3 justify-content-end">
            <Button
              label="Reset Database"
              icon="fas fa-redo"
              onClick={handleResetCollection}
              severity="warning"
              outlined
            />
            <Button
              label="Finish Setup"
              icon="fas fa-arrow-right"
              onClick={onComplete}
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
                <span>Finalizing...</span>
              </div>
              {collectionLogs.length > 0 && (
                <div className="p-3 surface-100 border-round" style={{ maxHeight: '300px', overflow: 'auto' }}>
                  <div className="text-sm font-semibold mb-2 text-600">Setup Logs:</div>
                  <code className="text-xs">
                    {collectionLogs.map((log, idx) => (
                      <div key={idx} className="text-600">
                        {log}
                      </div>
                    ))}
                  </code>
                </div>
              )}
            </>
          )}
          {!loading && (
            <Button
              label="Complete Setup"
              icon="fas fa-database"
              onClick={handleCreateCollection}
              size="large"
            />
          )}
        </>
      )}

      {error && <Message severity="error" text={error} />}
    </div>
  );
};
