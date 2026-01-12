import { useState, useEffect } from "react";
import TypesenseInstantSearchAdapter from "typesense-instantsearch-adapter";
import { InstantSearch, Configure } from "react-instantsearch";
import { PrimeReactProvider } from 'primereact/api';
import { StatusProvider, useStatus } from "./context/StatusContext";
import { NotificationProvider } from "./context/NotificationProvider";
import { ThemeProvider } from "./context/ThemeContext";
import { ConfirmDialog } from "primereact/confirmdialog";
import { ProgressSpinner } from 'primereact/progressspinner';
import { Button } from 'primereact/button';
import { type SearchHit } from "./types/search";
import { Header } from "./components/layout/Header";
import { MainContent } from "./components/layout/MainContent";
import { PreviewSidebar } from "./components/sidebars/PreviewSidebar";
import { InitializationWizard } from "./components/wizard/InitializationWizard";
import { StatusBar } from "./components/layout/StatusBar";
import { ContainerInitOverlay } from "./components/container/ContainerInitOverlay";
import { startCrawler, stopCrawler, startFileMonitoring, stopFileMonitoring, getWizardStatus, getAppConfig, type CrawlStatus } from "./api/client";

function AppContent({ searchClient }: { searchClient: any }) {
  const { status, stats, watchPaths } = useStatus();
  const [isCrawlerActive, setIsCrawlerActive] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [crawlerStatus, setCrawlerStatus] = useState<CrawlStatus["status"] | null>(null);
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
      } else {
        await startCrawler();
      }
    } catch (error) {
      console.error("Failed to toggle crawler:", error);
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

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: 'var(--surface-ground)'
      }}>
        <Header
          isCrawlerActive={isCrawlerActive}
          onToggleCrawler={handleToggleCrawler}
          isMonitoring={isMonitoring}
          onToggleMonitoring={handleToggleMonitoring}
          crawlerStatus={crawlerStatus || undefined}
          hasIndexedFiles={hasIndexedFiles}
          hasFoldersConfigured={hasFoldersConfigured}
        />

        <MainContent onResultClick={handleResultClick} isCrawlerActive={isCrawlerActive} />

        <PreviewSidebar
          visible={previewVisible}
          onHide={() => setPreviewVisible(false)}
          file={selectedFile}
        />
      </div>
    </InstantSearch>
  );
}

export default function App() {
  const [wizardCompleted, setWizardCompleted] = useState<boolean | null>(null);
  const [containersReady, setContainersReady] = useState<boolean>(false);
  const [searchClient, setSearchClient] = useState<any>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  // Check wizard status on mount
  useEffect(() => {
    const checkWizard = async () => {
      try {
        const status = await getWizardStatus();
        setWizardCompleted(status.wizard_completed);
      } catch (error) {
        console.error("Failed to check wizard status:", error);
        setWizardCompleted(false);
      }
    };
    checkWizard();
  }, []);

  // Fetch config and initialize search client after wizard is completed
  useEffect(() => {
    if (wizardCompleted) {
      const initClient = async () => {
        setConfigError(null);
        try {
          const config = await getAppConfig();
          const typesenseInstantsearchAdapter = new TypesenseInstantSearchAdapter({
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
              query_by: "file_path,content,title,description,subject,keywords,author,comments,producer,application,embedding",
              exclude_fields: "embedding",
              group_by: "file_path",
              group_limit: 1,
              per_page: 24,
            },
          });
          setSearchClient(typesenseInstantsearchAdapter.searchClient);
        } catch (error) {
          console.error("Failed to load app config:", error);
          setConfigError(error instanceof Error ? error.message : String(error));
          
          // Retry after a delay if it's a network error (backend might be starting)
          setTimeout(initClient, 3000);
        }
      };
      initClient();
    }
  }, [wizardCompleted]);

  // Show loading while checking wizard status
  if (wizardCompleted === null) {
    return (
      <div className="flex align-items-center justify-content-center h-screen" style={{ backgroundColor: 'var(--surface-ground)' }}>
         <ProgressSpinner style={{width: '50px', height: '50px'}} strokeWidth="4" animationDuration=".5s" />
      </div>
    );
  }

  // Show wizard if not completed
  if (!wizardCompleted) {
    return (
      <PrimeReactProvider>
        <ThemeProvider>
          <InitializationWizard onComplete={() => setWizardCompleted(true)} />
        </ThemeProvider>
      </PrimeReactProvider>
    );
  }

  // Show main app only after wizard completion
  return (
    <PrimeReactProvider>
      <ThemeProvider>
        <StatusProvider enabled={wizardCompleted === true}>
          <NotificationProvider>
            {searchClient ? (
              <AppContent searchClient={searchClient} />
            ) : (
              <div className="flex flex-column align-items-center justify-content-center h-screen" style={{ backgroundColor: 'var(--surface-ground)' }}>
                <ProgressSpinner style={{width: '50px', height: '50px'}} strokeWidth="4" animationDuration=".5s" />
                <p className="mt-3 text-600">
                  {configError ? `Connection failed: ${configError}. Retrying...` : 'Loading Configuration...'}
                </p>
                {configError && (
                  <Button 
                    label="Retry Now" 
                    icon="fas fa-sync" 
                    className="p-button-text mt-2" 
                    onClick={() => setWizardCompleted(prev => prev)} // Trigger effect
                  />
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