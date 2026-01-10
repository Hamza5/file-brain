import { useState, useEffect } from "react";
import TypesenseInstantSearchAdapter from "typesense-instantsearch-adapter";
import { InstantSearch, Configure } from "react-instantsearch";
import { StatusProvider, useStatus } from "./context/StatusContext";
import { NotificationProvider } from "./context/NotificationProvider";
import { ThemeProvider } from "./context/ThemeContext";
import { ConfirmDialog } from "primereact/confirmdialog";
import { type SearchHit } from "./types/search";
import { Header } from "./components/layout/Header";
import { MainContent } from "./components/layout/MainContent";
import { PreviewSidebar } from "./components/sidebars/PreviewSidebar";
import { InitializationWizard } from "./components/wizard/InitializationWizard";
import { StatusBar } from "./components/layout/StatusBar";
import { startCrawler, stopCrawler, startFileMonitoring, stopFileMonitoring, getWizardStatus, type CrawlStatus } from "./api/client";

// Configure Typesense InstantSearch adapter
const typesenseInstantsearchAdapter = new TypesenseInstantSearchAdapter({
  server: {
    // IMPORTANT: use a search-only API key in real deployments
    apiKey: "xyz-typesense-key",
    nodes: [
      {
        host: "localhost",
        port: 8108,
        path: "",
        protocol: "http",
      },
    ],
    cacheSearchResultsForSeconds: 0,
    connectionTimeoutSeconds: 30, // Extended timeout for slower queries
  },
  additionalSearchParameters: {
    // Search strategy:
    // - Search all chunks (full content coverage)
    // - Group by file_path to deduplicate (one result per file)
    // - Relevance determines which chunk is shown (best match)
    // - All chunks have essential metadata (file_extension, file_size, mime_type, modified_time)
    query_by: "file_path,content,title,description,subject,keywords,author,comments,producer,application,embedding",
    exclude_fields: "embedding",
    group_by: "file_path", // Deduplicate: show each file once
    group_limit: 1, // Show the most relevant chunk per file
    per_page: 24,
  },
});

const searchClient = typesenseInstantsearchAdapter.searchClient;

function AppContent() {
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

  // Show loading while checking wizard status
  if (wizardCompleted === null) {
    return <div className="flex align-items-center justify-content-center h-screen">Loading...</div>;
  }

  // Show wizard if not completed
  if (!wizardCompleted) {
    return <InitializationWizard onComplete={() => setWizardCompleted(true)} />;
  }

  // Show main app only after wizard completion
  return (
    <ThemeProvider>
      <StatusProvider enabled={wizardCompleted === true}>
        <NotificationProvider>
          <AppContent />

          {/* Global Confirm Dialog - Single instance for all delete operations */}
          <ConfirmDialog />
          <StatusBar />
        </NotificationProvider>
      </StatusProvider>
    </ThemeProvider>
  );
}