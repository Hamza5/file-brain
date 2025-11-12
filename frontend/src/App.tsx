import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import TypesenseInstantSearchAdapter from "typesense-instantsearch-adapter";
import { InstantSearch } from "react-instantsearch";
import { AppShell } from "./layout/AppShell";
import { SearchPage } from "./pages/SearchPage";
import { StatsPage } from "./pages/StatsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StatusProvider } from "./context/StatusContext";

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
  },
  additionalSearchParameters: {
    // Hybrid search defaults:
    // - Lexical over file_name, file_path, content, title, description
    // - Embeddings-backed semantic search via "embedding" field (server-side configured)
    // - Exclude embedding vector from responses
    query_by: "file_name,file_path,content,title,description,embedding",
    exclude_fields: "embedding",
    vector_query: "embedding:([], k:50)",
  },
});

const searchClient = typesenseInstantsearchAdapter.searchClient;

export default function App() {
  return (
    <BrowserRouter>
      <StatusProvider>
        <InstantSearch indexName="files" searchClient={searchClient} future={{ preserveSharedStateOnUnmount: true }}>
          <AppShell>
            <Routes>
              <Route path="/search" element={<SearchPage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/search" replace />} />
            </Routes>
          </AppShell>
        </InstantSearch>
      </StatusProvider>
    </BrowserRouter>
  );
}