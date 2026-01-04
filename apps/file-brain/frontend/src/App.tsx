import React, { useState } from "react";
import TypesenseInstantSearchAdapter from "typesense-instantsearch-adapter";
import { InstantSearch, Configure } from "react-instantsearch";
import { StatusProvider, useStatus } from "./context/StatusContext";
import { NotificationProvider } from "./context/NotificationProvider";
import { ConfirmDialog } from "primereact/confirmdialog";
import { Header } from "./components/Header";
import { MainContent } from "./components/MainContent";
import { PreviewSidebar } from "./components/PreviewSidebar";
import { SettingsDialog } from "./components/SettingsDialog";
import { InitializationOverlay } from "./components/InitializationOverlay";
import { InitializationStatusBar } from "./components/InitializationStatusBar";
import { connectStatusStream, startCrawler, stopCrawler, startFileMonitoring, stopFileMonitoring } from "./api/client";

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
    query_by: "file_path,content,title,description,subject,keywords,author,comments,producer,application",
    exclude_fields: "embedding",
    group_by: "file_path", // Deduplicate: show each file once
    group_limit: 1, // Show the most relevant chunk per file
    per_page: 24,
  },
});

const searchClient = typesenseInstantsearchAdapter.searchClient;

function AppContent() {
  const { stats, watchPaths } = useStatus();
  const [isCrawlerActive, setIsCrawlerActive] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [crawlerStatus, setCrawlerStatus] = useState<any>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState<any>(null);

  // Connect to crawler status stream
  React.useEffect(() => {
    const disconnect = connectStatusStream((payload) => {
      setCrawlerStatus(payload.status);
      setIsCrawlerActive(payload.status.running);
      setIsMonitoring(payload.status.monitoring_active ?? false);
    });
    return () => disconnect();
  }, []);

  const handleToggleCrawler = async (value: boolean) => {
    try {
      if (value) {
        await startCrawler();
      } else {
        await stopCrawler();
      }
      // Optimistic update
      setIsCrawlerActive(value);
    } catch (error) {
      console.error("Failed to toggle crawler:", error);
      // Revert on failure (optional, or let stream update fix it)
    }
  };

  const handleToggleMonitoring = async (value: boolean) => {
    try {
        if (value) {
            await startFileMonitoring();
        } else {
            await stopFileMonitoring();
        }
        setIsMonitoring(value);
    } catch (error) {
        console.error("Failed to toggle monitoring:", error);
    }
  };

  const handleResultClick = (file: any) => {
    setSelectedFile(file);
    setPreviewVisible(true);
  };

  // Derive state from StatusContext
  const indexedCount = stats?.totals.indexed ?? 0;
  const hasFoldersConfigured = watchPaths.length > 0;
  const hasIndexedFiles = indexedCount > 0;


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
          onSettingsClick={() => setSettingsVisible(true)}
          isCrawlerActive={isCrawlerActive}
          onToggleCrawler={handleToggleCrawler}
          isMonitoring={isMonitoring}
          onToggleMonitoring={handleToggleMonitoring}
          crawlerStatus={crawlerStatus}
          hasIndexedFiles={hasIndexedFiles}
          hasFoldersConfigured={hasFoldersConfigured}
        />

        <MainContent onResultClick={handleResultClick} isCrawlerActive={isCrawlerActive} />

        <PreviewSidebar
          visible={previewVisible}
          onHide={() => setPreviewVisible(false)}
          file={selectedFile}
        />

        <SettingsDialog
          visible={settingsVisible}
          onHide={() => setSettingsVisible(false)}
          onRefreshStats={() => { }}
        />
      </div>
    </InstantSearch>
  );
}

export default function App() {
  return (
    <StatusProvider>
      <NotificationProvider>
        <AppContent />

        {/* Global Confirm Dialog - Single instance for all delete operations */}
        <ConfirmDialog />
        <InitializationOverlay />
        <InitializationStatusBar />
      </NotificationProvider>
    </StatusProvider>
  );
}