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
import { connectStatusStream, startCrawler, stopCrawler } from "./api/client";

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
    // Hybrid search defaults:
    // - Lexical over file_name, file_path, content, title, description
    // - Embeddings-backed semantic search via "embedding" field (server-side configured)
    // - Exclude embedding vector from responses
    query_by: "file_name,file_path,content,title,description,subject,keywords,author,comments,producer,application,embedding",
    exclude_fields: "embedding",
    vector_query: "embedding:([], k:50)",
    per_page: 24, // Increased per page for grid view
  },
});

const searchClient = typesenseInstantsearchAdapter.searchClient;

function AppContent() {
  const { stats, watchPaths } = useStatus();
  const [isCrawlerActive, setIsCrawlerActive] = useState(false);
  const [crawlerStatus, setCrawlerStatus] = useState<any>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState<any>(null);

  // Connect to crawler status stream
  React.useEffect(() => {
    const disconnect = connectStatusStream((payload) => {
      setCrawlerStatus(payload.status);
      setIsCrawlerActive(payload.status.running);
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
      </NotificationProvider>
    </StatusProvider>
  );
}