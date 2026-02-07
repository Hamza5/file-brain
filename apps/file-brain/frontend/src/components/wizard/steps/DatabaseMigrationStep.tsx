import React, { useState, useEffect, useRef } from "react";
import { Button } from "primereact/button";
import { Message } from "primereact/message";
import { ProgressBar } from "primereact/progressbar";
import { upgradeDatabase } from "../../../api/client";
import { Card } from "primereact/card";

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
    <div className="grid grid-cols-1">
      <div className="col-12">
        <div className="text-center mb-5">
          <h2 className="text-4xl font-bold mb-2">Database Update</h2>
          <p className="text-lg text-gray-400">
            Internal database schema needs to be updated to support new features.
          </p>
        </div>

        <div className="flex justify-content-center mb-5">
            {status === "idle" && (
                <Button 
                label="Apply Update" 
                icon="pi pi-database" 
                onClick={startMigration}
                size="large" 
                />
            )}

            {status === "running" && (
                <div className="w-full max-w-md">
                    <ProgressBar mode="indeterminate" style={{ height: '6px' }} />
                    <p className="text-center mt-2 text-gray-400">Applying changes...</p>
                </div>
            )}

            {status === "success" && (
                <div className="flex flex-column align-items-center gap-3">
                    <Message severity="success" text="Database is up to date!" />
                    <Button 
                        label="Continue" 
                        icon="pi pi-arrow-right" 
                        onClick={onComplete} 
                        size="large"
                    />
                </div>
            )}

            {status === "error" && (
                <div className="flex flex-column align-items-center gap-3">
                    <Message severity="error" text="Update failed. Please check logs and try again." />
                    <Button 
                        label="Retry" 
                        icon="pi pi-refresh" 
                        onClick={startMigration} 
                        severity="warning"
                    />
                </div>
            )}
        </div>

        <Card title="Migration Logs" className="bg-gray-900 text-white">
            <div className="h-20rem overflow-y-auto font-mono text-sm p-2" style={{ backgroundColor: '#1e1e1e', borderRadius: '4px' }}>
                {logs.length === 0 && <span className="text-gray-500">Waiting to start...</span>}
                {logs.map((log, i) => (
                    <div key={i} className="mb-1 border-bottom-1 border-gray-800 pb-1">{log}</div>
                ))}
                <div ref={logsEndRef} />
            </div>
        </Card>
      </div>
    </div>
  );
};
