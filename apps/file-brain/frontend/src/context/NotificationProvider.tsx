import { useRef } from "react";
import type { ReactNode } from "react";
import { Toast } from "primereact/toast";
import { NotificationContext, type NotificationContextValue } from "./NotificationContext";

type Severity = "success" | "info" | "warn" | "error";

interface NotificationProviderProps {
  children: ReactNode;
}

/**
 * NotificationProvider wraps the app, renders a single PrimeReact Toast,
 * and exposes helpers via NotificationContext.
 */
export function NotificationProvider({ children }: NotificationProviderProps) {
  const toastRef = useRef<Toast | null>(null);

  function show(severity: Severity, summary: string, detail?: string) {
    toastRef.current?.show({
      severity,
      summary,
      detail,
      life: 4000,
    });
  }

  const value: NotificationContextValue = {
    showSuccess: (summary, detail) => show("success", summary, detail),
    showInfo: (summary, detail) => show("info", summary, detail),
    showWarn: (summary, detail) => show("warn", summary, detail),
    showError: (summary, detail) => show("error", summary, detail),
  };

  return (
    <NotificationContext.Provider value={value}>
      <Toast ref={toastRef} position="top-right" />
      {children}
    </NotificationContext.Provider>
  );
}