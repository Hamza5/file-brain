import React, { useState, useEffect, useRef } from "react";
import { Button } from "primereact/button";
import { Message } from "primereact/message";
import { ProgressBar } from "primereact/progressbar";
import { upgradeDatabase } from "../../../api/client";
import { WizardStepLayout } from "../shared/WizardStepLayout";
import { WizardLogViewer } from "../shared/WizardLogViewer";

interface DatabaseMigrationStepProps {
  onComplete: () => void;
  onError: (error: string) => void;
  isActive: boolean;
}

export const DatabaseMigrationStep: React.FC<DatabaseMigrationStepProps> = ({
  onComplete,
  onError,
}) => {
  const [status, setStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const startMigration = async () => {
    setStatus("running");
    setLogs((prev) => [...prev, "Starting database migration..."]);

    try {
      const result = await upgradeDatabase();

      if (result.success) {
        setLogs((prev) => [...prev, ...result.logs, "Migration completed successfully."]);
        setStatus("success");
        // Auto-proceed after successful migration
        setTimeout(() => {
          onComplete();
        }, 2000);
      } else {
        setLogs((prev) => [...prev, ...result.logs, "Migration failed."]);
        setStatus("error");
        onError(result.message);
      }
    } catch (e: unknown) {
      let errorMsg = "Unknown error";
      if (e instanceof Error) {
        errorMsg = e.message;
      } else if (typeof e === "string") {
        errorMsg = e;
      }
      setLogs((prev) => [...prev, `Error: ${errorMsg}`]);
      setStatus("error");
      onError(errorMsg);
    }
  };

  // Scroll to bottom of logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Auto-start if requested? For now, let's require user interaction for safety/visibility.

  return (
    <WizardStepLayout 
      title="Database Migration"
      description="Internal database schema needs to be updated to support new features."
    >
      {status === "idle" && (
        <Button 
          label="Apply Update" 
          icon="pi pi-database" 
          onClick={startMigration}
          size="large" 
        />
      )}

      {status === "running" && (
        <>
          <ProgressBar mode="indeterminate" style={{ height: '6px' }} />
          <p className="text-center mt-2 text-600">Applying changes...</p>
        </>
      )}

      {status === "success" && (
        <>
          <Message severity="success" text="Database is up to date!" />
          <Button 
            label="Continue" 
            icon="pi pi-arrow-right" 
            onClick={onComplete} 
            size="large"
          />
        </>
      )}

      {status === "error" && (
        <>
          <Message severity="error" text="Update failed. Please check logs and try again." />
          <Button 
            label="Retry" 
            icon="pi pi-refresh" 
            onClick={startMigration} 
            size="large"
            severity="warning"
          />
        </>
      )}

      {logs.length > 0 && (
        <WizardLogViewer logs={logs} title="Migration Logs" />
      )}
    </WizardStepLayout>
  );
};
