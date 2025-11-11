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
    // Ensure these fields exist in Typesense schema:
    // file_name, content, file_path, file_extension, mime_type, etc.
    // Remove "path" which is not in the schema and caused 404 validation errors.
    query_by: "file_name,content",
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