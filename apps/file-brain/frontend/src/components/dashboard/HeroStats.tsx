import React, { useState } from "react";
import { Card } from "primereact/card";
import { Tooltip } from "primereact/tooltip";
import { useStatus } from "../../context/StatusContext";
import { WatchedFoldersSidebar } from "../sidebars/WatchedFoldersSidebar";
import { IndexManagementSidebar } from "../sidebars/IndexManagementSidebar";
import { RecentFilesList } from './RecentFilesList';
import { FileTypeChart } from './FileTypeChart';
import { IndexingActivityChart } from './IndexingActivityChart';
import { FileTypeDrillDown } from './FileTypeDrillDown';
import { IndexStorageCard } from './IndexStorageCard';

export const HeroStats: React.FC = () => {
  const { stats, watchPaths } = useStatus();
  const hasFoldersConfigured = watchPaths.length > 0;
  
  // Sidebar visibility state
  const [watchedFoldersVisible, setWatchedFoldersVisible] = useState(false);
  const [indexManagementVisible, setIndexManagementVisible] = useState(false);

  // Drill-down state
  const [drillDownVisible, setDrillDownVisible] = useState(false);
  const [drillDownExt, setDrillDownExt] = useState<string>("");

  // Handle chart segment click for drill-down
  const handleChartClick = (ext: string) => {
    setDrillDownExt(ext);
    setDrillDownVisible(true);
  };

  // Stat Card component with optional tooltip and action
  const StatCard = ({ icon, label, value, subtext, helpId, onClick }: { 
    icon: string; label: string; value: string | number; subtext?: string; helpId?: string;
    onClick?: () => void;
  }) => (
    <div 
        className={`surface-card border-round-2xl p-3 shadow-2 flex flex-column align-items-center justify-content-center text-center h-full gap-1 relative ${onClick ? 'cursor-pointer hover:shadow-4 surface-hover transition-all transition-duration-200' : ''}`}
        onClick={onClick}
    >

      <div className="flex align-items-center justify-content-center bg-primary-reverse border-round-xl">
        <i className={`${icon} text-3xl text-primary`} />
      </div>
      <div className="text-2xl font-bold text-color">{value}</div>
      <div className="flex align-items-center gap-1">
        <span className="text-xs text-color-secondary font-semibold uppercase tracking-wider">{label}</span>
        {helpId && <i className={`fa-solid fa-circle-question text-color-secondary text-xs cursor-help ${helpId}`} />}
      </div>
      {subtext && <div className="text-xs text-color-secondary opacity-70" style={{ fontSize: '10px' }}>{subtext}</div>}
    </div>
  );

  return (
    <div className="flex flex-column gap-3 p-3 overflow-y-auto h-full">
      {/* Help Tooltips */}
      <Tooltip target=".help-indexed" position="bottom" className="text-sm" style={{ maxWidth: '220px' }}>
        Files that have been processed and are searchable. Click to manage index.
      </Tooltip>
      <Tooltip target=".help-discovered" position="bottom" className="text-sm" style={{ maxWidth: '220px' }}>
        Files found in your watched folders. Some may be pending processing.
      </Tooltip>
      <Tooltip target=".help-storage" position="bottom" className="text-sm" style={{ maxWidth: '220px' }}>
        Memory used by the search engine to store your searchable index. Click to manage index.
      </Tooltip>
      <Tooltip target=".help-folders" position="bottom" className="text-sm" style={{ maxWidth: '220px' }}>
        Number of folders being monitored for changes. Click to manage folders.
      </Tooltip>

      {/* Stat Cards */}
      <div className="grid">
        <div className="col-6 md:col-3">
          <StatCard
            icon="fa-solid fa-file-circle-check"
            label="Indexed"
            value={stats?.totals.indexed.toLocaleString() || "0"}
            helpId="help-indexed"
            onClick={() => setIndexManagementVisible(true)}
          />
        </div>
        <div className="col-6 md:col-3">
          <StatCard
            icon="fa-solid fa-magnifying-glass"
            label="Discovered"
            value={stats?.totals.discovered.toLocaleString() || "0"}
            helpId="help-discovered"
          />
        </div>
        <div className="col-6 md:col-3">
          <IndexStorageCard onClick={() => setIndexManagementVisible(true)} />
        </div>
        <div className="col-6 md:col-3">
          <StatCard
            icon="fa-solid fa-folder-open"
            label="Folders"
            value={watchPaths.length}
            subtext="Watching"
            helpId="help-folders"
            onClick={() => setWatchedFoldersVisible(true)}
          />
        </div>
      </div>

      {/* Main Content Area: Charts & Recent Files */}
      <div className="grid align-content-stretch">
        {/* Left Column: Charts */}
        <div className="col-12 xl:col-8">
          <div className="grid h-full">
            {/* Indexing Activity Chart */}
            <div className="col-12 lg:col-6 pb-3 lg:pb-0 h-full">
              <IndexingActivityChart />
            </div>

            {/* File Type Chart */}
            <div className="col-12 lg:col-6 h-full">
              <FileTypeChart 
                fileTypes={stats?.file_types}
                onSegmentClick={handleChartClick}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Recent Files */}
        <div className="col-12 xl:col-4">
          <RecentFilesList />
        </div>
      </div>

      {/* Empty State */}
      {(!stats || stats.totals.indexed === 0) && (
        <Card className="text-center surface-100" style={{ border: "2px dashed var(--primary-color)" }}>
          <i className={`fa-solid ${hasFoldersConfigured ? "fa-play-circle" : "fa-folder-plus"} text-4xl text-primary mb-3`} />
          <h3 className="text-lg font-semibold text-color mb-2">
            {hasFoldersConfigured ? "Ready to Index" : "Get Started"}
          </h3>
          <p className="text-color-secondary">
            {hasFoldersConfigured
              ? "Enable the Crawler toggle in the header to start processing your files."
              : "Click the \"Folders\" card above to add directories, then start the crawler."}
          </p>
        </Card>
      )}

      {/* Drill-down Sidebar */}
      <FileTypeDrillDown
        visible={drillDownVisible}
        fileExtension={drillDownExt}
        onHide={() => setDrillDownVisible(false)}
      />

      {/* Management Sidebars */}
      <WatchedFoldersSidebar
        visible={watchedFoldersVisible}
        onHide={() => setWatchedFoldersVisible(false)}
      />

      <IndexManagementSidebar
        visible={indexManagementVisible}
        onHide={() => setIndexManagementVisible(false)}
      />
    </div>
  );
};
