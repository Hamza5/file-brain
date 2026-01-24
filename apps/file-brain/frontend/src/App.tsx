import { useState, useEffect } from "react";
import TypesenseInstantSearchAdapter from "typesense-instantsearch-adapter";
import { InstantSearch, Configure } from "react-instantsearch";
import { PrimeReactProvider } from "primereact/api";
import { StatusProvider, useStatus } from "./context/StatusContext";
import { NotificationProvider } from "./context/NotificationProvider";
import { useNotification } from "./context/NotificationContext";
import { IndexingNotifier } from "./context/IndexingNotifier";
import { ThemeProvider } from "./context/ThemeContext";
import { ConfirmDialog } from "primereact/confirmdialog";
import { Button } from "primereact/button";
import { Message } from "primereact/message";
import { type SearchHit } from "./types/search";
import { Header } from "./components/layout/Header";
import { MainContent } from "./components/layout/MainContent";
import { PreviewSidebar } from "./components/sidebars/PreviewSidebar";
import { InitializationWizard } from "./components/wizard/InitializationWizard";
import { StatusBar } from "./components/layout/StatusBar";
import { ContainerInitOverlay } from "./components/container/ContainerInitOverlay";
import { PremiumLoading } from "./components/shared/PremiumLoading";
import {
  startCrawler,
  stopCrawler,
  startFileMonitoring,
  stopFileMonitoring,
  checkStartupRequirements,
  getAppConfig,
  type CrawlStatus,
} from "./api/client";

function AppContent({ searchClient }: { searchClient: any }) {
  const { status, stats, watchPaths } = useStatus();
  const { showSuccess, showInfo, showError } = useNotification();
  const [isCrawlerActive, setIsCrawlerActive] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [crawlerStatus, setCrawlerStatus] = useState<
    CrawlStatus["status"] | null
  >(null);
  // Derived state for header
  const hasIndexedFiles = (stats?.totals?.discovered || 0) > 0;
  const hasFoldersConfigured = (watchPaths?.length || 0) > 0;

  const [previewVisible, setPreviewVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState<SearchHit | null>(null);

  // Sync local state with global status
  useEffect(() => {
    if (status) {
      setIsCrawlerActive(status.running);
      setIsMonitoring(status.monitoring_active);
      setCrawlerStatus(status);
    }
  }, [status]);

  const handleToggleCrawler = async () => {
    try {
      if (isCrawlerActive) {
        await stopCrawler();
        showInfo("Indexing Stopped", "The indexer has been stopped.");
      } else {
        await startCrawler();
        showSuccess(
          "Indexing Started",
          "The indexer is now scanning your files.",
        );
      }
    } catch (error) {
      console.error("Failed to toggle crawler:", error);
      showError(
        "Indexing Error",
        "Failed to toggle the indexer. Please try again.",
      );
    }
  };

  const handleToggleMonitoring = async () => {
    try {
      if (isMonitoring) {
        await stopFileMonitoring();
      } else {
        await startFileMonitoring();
      }
    } catch (error) {
      console.error("Failed to toggle monitoring:", error);
    }
  };

  const handleResultClick = (file: SearchHit) => {
    setSelectedFile(file);
    setPreviewVisible(true);
  };

  return (
    <InstantSearch
      indexName="files"
      searchClient={searchClient}
      future={{ preserveSharedStateOnUnmount: true }}
    >
      <Configure hitsPerPage={24} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          overflow: "hidden",
          backgroundColor: "var(--surface-ground)",
        }}
      >
        <Header
          isCrawlerActive={isCrawlerActive}
          onToggleCrawler={handleToggleCrawler}
          isMonitoring={isMonitoring}
          onToggleMonitoring={handleToggleMonitoring}
          crawlerStatus={crawlerStatus || undefined}
          hasIndexedFiles={hasIndexedFiles}
          hasFoldersConfigured={hasFoldersConfigured}
        />

        <MainContent
          onResultClick={handleResultClick}
          isCrawlerActive={isCrawlerActive}
        />

        <PreviewSidebar
          visible={previewVisible}
          onHide={() => setPreviewVisible(false)}
          file={selectedFile}
        />
      </div>
    </InstantSearch>
  );
}

import { usePostHog } from "./context/PostHogProvider";

export default function App() {
  const [wizardNeeded, setWizardNeeded] = useState<boolean | null>(null);
  const [wizardStartStep, setWizardStartStep] = useState<number>(0);
  const [isUpgrade, setIsUpgrade] = useState<boolean>(false);
  const [containersReady, setContainersReady] = useState<boolean>(false);
  const [searchClient, setSearchClient] = useState<any>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [startupCheckError, setStartupCheckError] = useState<string | null>(
    null,
  );
  const [retryCount, setRetryCount] = useState<number>(0);
  const posthog = usePostHog();

  // Track when main UI is finally viewed (containers ready + search client loaded)
  useEffect(() => {
    if (containersReady && searchClient && posthog) {
      posthog.capture('app_main_ui_viewed');
    }
  }, [containersReady, searchClient, posthog]);
  // Check startup requirements on mount with timeout and retry logic
  useEffect(() => {
    const MAX_RETRIES = 3;
    const TIMEOUT_MS = 5000; // 5 seconds per attempt (reduced from 15s - backend is now faster)

    const checkStartupWithTimeout = async (): Promise<any> => {
      return Promise.race([
        checkStartupRequirements(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Startup check timed out")),
            TIMEOUT_MS,
          ),
        ),
      ]);
    };

    const checkStartup = async (attemptNumber: number = 0) => {
      setRetryCount(attemptNumber);
      setStartupCheckError(null);

      try {
        const result = await checkStartupWithTimeout();
        setWizardNeeded(result.needs_wizard);
        setWizardStartStep(result.start_step || 0);
        setIsUpgrade(result.is_upgrade);
        setStartupCheckError(null);
      } catch (error) {
        console.error(
          `Failed to check startup requirements (attempt ${attemptNumber + 1}/${MAX_RETRIES}):`,
          error,
        );

        if (attemptNumber < MAX_RETRIES - 1) {
          // Retry with exponential backoff
          const delayMs = Math.min(1000 * Math.pow(2, attemptNumber), 5000);
          console.log(`Retrying in ${delayMs}ms...`);
          setTimeout(() => checkStartup(attemptNumber + 1), delayMs);
        } else {
          // All retries exhausted - assume wizard is needed and show error
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          setStartupCheckError(errorMessage);
          setWizardNeeded(true);
          setWizardStartStep(0);
          setIsUpgrade(false);
        }
      }
    };

    checkStartup();
  }, []);

  // Fetch config and initialize search client after wizard is not needed
  useEffect(() => {
    if (wizardNeeded === false) {
      const initClient = async () => {
        setConfigError(null);
        try {
          const config = await getAppConfig();
          const typesenseInstantsearchAdapter =
            new TypesenseInstantSearchAdapter({
              server: {
                apiKey: config.typesense.api_key,
                nodes: [
                  {
                    host: config.typesense.host,
                    port: config.typesense.port,
                    path: "",
                    protocol: config.typesense.protocol,
                  },
                ],
                cacheSearchResultsForSeconds: 0,
                connectionTimeoutSeconds: 30,
              },
              additionalSearchParameters: {
                query_by:
                  "file_path,content,title,description,subject,keywords,author,comments,producer,application,embedding",
                exclude_fields: "embedding",
                group_by: "file_path",
                group_limit: 1,
                per_page: 24,
              },
            });
          setSearchClient(typesenseInstantsearchAdapter.searchClient);
        } catch (error) {
          console.error("Failed to load app config:", error);
          setConfigError(
            error instanceof Error ? error.message : String(error),
          );

          // Retry after a delay if it's a network error (backend might be starting)
          setTimeout(initClient, 3000);
        }
      };
      initClient();
    }
  }, [wizardNeeded]);

  // Show loading while checking startup requirements
  if (wizardNeeded === null) {
    return (
      <PrimeReactProvider>
        <ThemeProvider>
          <div style={{ backgroundColor: "var(--surface-ground)" }}>
            <PremiumLoading
              message="FileBrain is starting..."
              subMessage={
                retryCount > 0
                  ? `Checking system status (attempt ${retryCount + 1}/3)...`
                  : "Checking system status..."
              }
            />
            {startupCheckError && (
              <div className="fixed bottom-0 left-0 right-0 flex justify-content-center pb-8">
                <div className="flex flex-column align-items-center gap-3 p-4 border-round-xl shadow-4" style={{ backgroundColor: 'var(--surface-overlay)', maxWidth: '450px', width: '90%', border: '1px solid var(--surface-border)' }}>
                  <Message
                    severity="error"
                    text={`Failed to connect to backend: ${startupCheckError}`}
                    className="w-full"
                  />
                  <p className="text-center text-sm text-600 m-0">
                    Make sure the application backend is running.
                  </p>
                  <Button
                    label="Start Setup Wizard Anyway"
                    icon="fas fa-play"
                    severity="info"
                    size="small"
                    onClick={() => {
                      setWizardNeeded(true);
                      setWizardStartStep(0);
                      setIsUpgrade(false);
                      setStartupCheckError(null);
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </ThemeProvider>
      </PrimeReactProvider>
    );
  }

  // Show wizard if needed
  if (wizardNeeded) {
    return (
      <PrimeReactProvider>
        <ThemeProvider>
          <InitializationWizard
            onComplete={() => setWizardNeeded(false)}
            startStep={wizardStartStep}
            isUpgrade={isUpgrade}
          />
        </ThemeProvider>
      </PrimeReactProvider>
    );
  }

  // Show main app only after wizard is not needed
  return (
    <PrimeReactProvider>
      <ThemeProvider>
        <StatusProvider enabled={wizardNeeded === false}>
          <NotificationProvider>
            <IndexingNotifier />
            {searchClient ? (
              <AppContent searchClient={searchClient} />
            ) : (
              <div style={{ backgroundColor: "var(--surface-ground)" }}>
                <PremiumLoading
                  message="Almost there..."
                  subMessage={
                    configError
                      ? `Connection failed: ${configError}. Retrying...`
                      : "Finalizing configuration..."
                  }
                />
                {configError && (
                  <div className="fixed bottom-0 left-0 right-0 flex justify-content-center pb-8">
                    <Button
                      label="Retry Now"
                      icon="fas fa-sync"
                      severity="secondary"
                      onClick={() => setWizardNeeded((prev) => prev)}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Container initialization overlay - blocks interaction until containers ready */}
            <ContainerInitOverlay
              isVisible={!containersReady}
              onReady={() => setContainersReady(true)}
            />

            {/* Global Confirm Dialog - Single instance for all delete operations */}
            <ConfirmDialog />
            <StatusBar />
          </NotificationProvider>
        </StatusProvider>
      </ThemeProvider>
    </PrimeReactProvider>
  );
}
