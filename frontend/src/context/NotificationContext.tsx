import { createContext, useContext } from "react";

export type Severity = "success" | "info" | "warn" | "error";

export interface NotificationContextValue {
  showSuccess: (summary: string, detail?: string) => void;
  showInfo: (summary: string, detail?: string) => void;
  showWarn: (summary: string, detail?: string) => void;
  showError: (summary: string, detail?: string) => void;
}

export const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

/**
 * Hook to consume the NotificationContext.
 * Ensures components can trigger Toast notifications easily.
 */
export function useNotification(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotification must be used within NotificationProvider");
  }
  return ctx;
}