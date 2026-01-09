import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "primereact/card";
import { Chart } from "primereact/chart";
import { SelectButton } from "primereact/selectbutton";
import { Sidebar } from "primereact/sidebar";
import { Paginator } from "primereact/paginator";
import { Tooltip } from "primereact/tooltip";
import { useStatus } from "../context/StatusContext";
import { FileContextMenu } from "./FileContextMenu";
import { fileOperationsService } from "../services/fileOperations";
import { confirmDialog } from "primereact/confirmdialog";
import {
  getRecentFiles,
  getIndexingActivity,
  getFilesByType,
  getStorageByType,
  getIndexStorage,
  type RecentFile,
  type IndexingActivityResponse,
} from "../api/client";
import { WatchedFoldersSidebar } from "./WatchedFoldersSidebar";
import { IndexManagementSidebar } from "./IndexManagementSidebar";

// Center text plugin for doughnut chart
const centerTextPlugin = {
  id: "centerText",
  beforeDraw: function (chart: {
    config: { type: string; options: { plugins: { centerText?: { value: string } } } };
    ctx: CanvasRenderingContext2D;
    chartArea: { top: number; left: number; width: number; height: number };
  }) {
    if (chart.config.type !== "doughnut") return;
    const { ctx, chartArea: { top, left, width, height } } = chart;
    ctx.save();
    const x = left + width / 2;
    const y = top + height / 2;
    const style = getComputedStyle(document.documentElement);
    const textColor = style.getPropertyValue("--text-color").trim() || "#495057";
    const textColorSecondary = style.getPropertyValue("--text-color-secondary").trim() || "#6c757d";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 1.25rem sans-serif";
    ctx.fillStyle = textColor;
    ctx.fillText(String(chart.config.options.plugins.centerText?.value || "0"), x, y - 10);
    ctx.font = "0.7rem sans-serif";
    ctx.fillStyle = textColorSecondary;
    ctx.fillText("Total Files", x, y + 10);
    ctx.restore();
  },
};

// Format bytes to human-readable
function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Format relative time
function formatRelativeTime(timestamp: number | null | undefined): string {
  if (!timestamp) return "—";
  const ms = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
  const diff = Date.now() - ms;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// Get file name from path
function getFileName(path: string | null | undefined): string {
  if (!path) return "Unknown";
  return path.split("/").pop() || path;
}

// Get file icon class
function getFileIcon(ext: string | null | undefined): string {
  const e = (ext || "").toLowerCase();
  if ([".pdf"].includes(e)) return "far fa-file-pdf";
  if ([".doc", ".docx", ".odt"].includes(e)) return "far fa-file-word";
  if ([".xls", ".xlsx", ".csv"].includes(e)) return "far fa-file-excel";
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(e)) return "far fa-file-image";
  if ([".mp4", ".mov", ".avi", ".mkv"].includes(e)) return "far fa-file-video";
  if ([".mp3", ".wav", ".ogg", ".flac"].includes(e)) return "far fa-file-audio";
  if ([".zip", ".tar", ".gz", ".rar", ".7z"].includes(e)) return "far fa-file-archive";
  if ([".py"].includes(e)) return "fab fa-python";
  if ([".js", ".jsx", ".ts", ".tsx"].includes(e)) return "fab fa-js";
  return "far fa-file";
}

export const HeroStats: React.FC = () => {
  const { stats, watchPaths } = useStatus();
  const hasFoldersConfigured = watchPaths.length > 0;
  const hasRenderedChart = useRef(false);

  // State for new features
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [activityData, setActivityData] = useState<IndexingActivityResponse | null>(null);
  const [activityRange, setActivityRange] = useState<"24h" | "7d">("24h");
  const [chartMode, setChartMode] = useState<"count" | "size">("count");
  const [storageByType, setStorageByType] = useState<Record<string, number>>({});
  
  // Sidebar visibility state
  const [watchedFoldersVisible, setWatchedFoldersVisible] = useState(false);
  const [indexManagementVisible, setIndexManagementVisible] = useState(false);

  // Drill-down dialog state
  const [drillDownVisible, setDrillDownVisible] = useState(false);
  const [drillDownExt, setDrillDownExt] = useState<string>("");
  const [drillDownFiles, setDrillDownFiles] = useState<RecentFile[]>([]);
  const [drillDownTotal, setDrillDownTotal] = useState(0);
  const [drillDownPage, setDrillDownPage] = useState(0);
  const [drillDownLoading, setDrillDownLoading] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    position: { x: number; y: number };
    filePath: string;
  }>({ visible: false, position: { x: 0, y: 0 }, filePath: "" });

  // Fetch recent files
  useEffect(() => {
    const fetchRecent = async () => {
      try {
        const result = await getRecentFiles(10);
        setRecentFiles(result.files);
      } catch (e) {
        console.error("Failed to fetch recent files:", e);
      }
    };
    fetchRecent();
    const interval = setInterval(fetchRecent, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch indexing activity
  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const result = await getIndexingActivity(activityRange);
        setActivityData(result);
      } catch (e) {
        console.error("Failed to fetch indexing activity:", e);
      }
    };
    fetchActivity();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchActivity, 30000);
    return () => clearInterval(interval);
  }, [activityRange]);

  // State for index storage (Typesense memory usage)
  const [indexMemoryBytes, setIndexMemoryBytes] = useState<number>(0);

  // Fetch index storage (Typesense memory)
  useEffect(() => {
    const fetchIndexStorage = async () => {
      try {
        const result = await getIndexStorage();
        setIndexMemoryBytes(result.index_memory_bytes);
      } catch (e) {
        console.error("Failed to fetch index storage:", e);
      }
    };
    fetchIndexStorage();
    const interval = setInterval(fetchIndexStorage, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  // Fetch storage by type for size mode
  useEffect(() => {
    if (chartMode === "size") {
      const fetchStorage = async () => {
        try {
          const result = await getStorageByType();
          setStorageByType(result.storage);
        } catch (e) {
          console.error("Failed to fetch storage by type:", e);
        }
      };
      fetchStorage();
    }
  }, [chartMode]);

  // Handle chart segment click for drill-down
  const handleChartClick = React.useCallback(async (ext: string) => {
    setDrillDownExt(ext);
    setDrillDownPage(0);
    setDrillDownVisible(true);
    await loadDrillDownFiles(ext, 1);
  }, []);

  const loadDrillDownFiles = async (ext: string, page: number) => {
    setDrillDownLoading(true);
    try {
      const result = await getFilesByType(ext, page);
      setDrillDownFiles(result.files);
      setDrillDownTotal(result.total);
    } catch (e) {
      console.error("Failed to load drill-down files:", e);
    } finally {
      setDrillDownLoading(false);
    }
  };

  // File type chart configuration
  const chartConfig = useMemo(() => {
    const source = chartMode === "count" ? stats?.file_types : storageByType;
    if (!source || Object.keys(source).length === 0) {
      return { chartData: null, chartOptions: null, totalFiles: 0 };
    }

    const TOP_COUNT = 5;
    const allFileTypes = Object.entries(source).sort((a, b) => b[1] - a[1]);
    const topFileTypes = allFileTypes.slice(0, TOP_COUNT);
    const otherCount = allFileTypes.slice(TOP_COUNT).reduce((sum, [, count]) => sum + count, 0);

    const fileTypeData = [...topFileTypes];
    if (otherCount > 0) fileTypeData.push(["Other", otherCount]);

    const total = fileTypeData.reduce((sum, [, count]) => sum + count, 0);
    const shouldAnimate = !hasRenderedChart.current;
    if (!hasRenderedChart.current) hasRenderedChart.current = true;

    const data = {
      labels: fileTypeData.map(([ext]) => ext || "Unknown"),
      datasets: [{
        data: fileTypeData.map(([, count]) => count),
        backgroundColor: ["#42A5F5", "#66BB6A", "#FFA726", "#AB47BC", "#26C6DA", "#9E9E9E"],
        borderWidth: 2,
        borderColor: "#ffffff",
      }],
    };

    const options = {
      plugins: {
        centerText: { value: chartMode === "count" ? String(total) : formatBytes(total) },
        legend: { display: true, position: "right" as const, labels: { usePointStyle: true, padding: 15 } },
        tooltip: {
          callbacks: {
            label: (context: { label?: string; parsed?: number }) => {
              const label = context.label || "";
              const value = context.parsed || 0;
              if (chartMode === "size") return `${label}: ${formatBytes(value)}`;
              const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
              return `${label}: ${value} files (${pct}%)`;
            },
          },
        },
      },
      cutout: "65%",
      maintainAspectRatio: true,
      responsive: true,
      animation: shouldAnimate ? { animateRotate: true, duration: 1000 } : false,
      onClick: (_: unknown, elements: Array<{ index: number }>) => {
        if (elements.length > 0) {
          const idx = elements[0].index;
          const ext = fileTypeData[idx]?.[0];
          if (ext && ext !== "Other") handleChartClick(ext);
        }
      },
    };

    return { chartData: data, chartOptions: options, totalFiles: total };
  }, [stats?.file_types, storageByType, chartMode, handleChartClick]);

  // Activity chart configuration
  const activityChartConfig = useMemo(() => {
    if (!activityData?.activity) return null;

    const labels = activityData.activity.map((p) => {
      const date = new Date(p.timestamp);
      return activityRange === "24h"
        ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : date.toLocaleDateString([], { weekday: "short" });
    });

    return {
      data: {
        labels,
        datasets: [{
          label: "Files Processed",
          data: activityData.activity.map((p) => p.count),
          fill: true,
          backgroundColor: "rgba(66, 165, 245, 0.2)",
          borderColor: "#42A5F5",
          tension: 0.4,
        }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { stepSize: 1 } },
        },
        maintainAspectRatio: false,
        responsive: true,
      },
    };
  }, [activityData, activityRange]);

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, filePath: string) => {
    e.preventDefault();
    setContextMenu({ visible: true, position: { x: e.clientX, y: e.clientY }, filePath });
  };

  const handleFileOperation = async (request: { file_path: string; operation: string }) => {
    if (request.operation === "delete") {
      confirmDialog({
        message: "Delete this file permanently?",
        header: "Confirm Delete",
        icon: "fa fa-exclamation-triangle",
        acceptClassName: "p-button-danger",
        accept: async () => {
          await fileOperationsService.deleteFile(request.file_path);
          setRecentFiles((prev) => prev.filter((f) => f.file_path !== request.file_path));
        },
      });
    } else if (request.operation === "file") {
      await fileOperationsService.openFile(request.file_path);
    } else if (request.operation === "folder") {
      await fileOperationsService.openFolder(request.file_path);
    }
  };

  // Stat Card component with optional tooltip and action
  const StatCard = ({ icon, label, value, subtext, helpId, onClick }: { 
    icon: string; label: string; value: string | number; subtext?: string; helpId?: string;
    onClick?: () => void;
  }) => (
    <div 
        className={`bg-white border-round-2xl p-3 shadow-2 flex flex-column align-items-center justify-content-center text-center h-full gap-1 relative ${onClick ? 'cursor-pointer hover:shadow-4 surface-hover transition-all transition-duration-200' : ''}`}
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
      <Tooltip target=".help-activity" position="bottom" className="text-sm" style={{ maxWidth: '250px' }}>
        Shows how many files were processed over time. Toggle between last 24 hours or 7 days.
      </Tooltip>
      <Tooltip target=".help-filetypes" position="bottom" className="text-sm" style={{ maxWidth: '250px' }}>
        Distribution of file types. Switch between count and storage size. Click a segment to see files.
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
          <StatCard
            icon="fa-solid fa-database"
            label="Index Size"
            value={formatBytes(indexMemoryBytes)}
            subtext="Search Engine"
            helpId="help-storage"
            onClick={() => setIndexManagementVisible(true)}
          />
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
          <div className="grid">
            {/* Indexing Activity Chart */}
            <div className="col-12 lg:col-6">
              <Card className="h-full border-round-2xl shadow-2 bg-white" pt={{ content: { className: 'p-3' } }}>
                <div className="flex justify-content-between align-items-center mb-3">
                  <div className="flex align-items-center gap-1">
                    <span className="font-semibold text-color">Processing Activity</span>
                    <i className="fa-solid fa-circle-question text-color-secondary text-xs cursor-help help-activity" />
                  </div>
                  <SelectButton
                    value={activityRange}
                    options={[{ label: "24h", value: "24h" }, { label: "7d", value: "7d" }]}
                    onChange={(e) => setActivityRange(e.value)}
                    className="p-buttonset-sm"
                  />
                </div>
                <div style={{ height: "200px" }}>
                  {activityChartConfig ? (
                    <Chart type="line" data={activityChartConfig.data} options={activityChartConfig.options} />
                  ) : (
                    <div className="flex align-items-center justify-content-center h-full text-color-secondary opacity-50">
                      No activity data
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* File Type Chart */}
            <div className="col-12 lg:col-6">
              <Card className="h-full border-round-2xl shadow-2 bg-white" pt={{ content: { className: 'p-3' } }}>
                <div className="flex justify-content-between align-items-center mb-3">
                  <div className="flex align-items-center gap-1">
                    <span className="font-semibold text-color">File Types</span>
                    <i className="fa-solid fa-circle-question text-color-secondary text-xs cursor-help help-filetypes" />
                  </div>
                  <SelectButton
                    value={chartMode}
                    options={[{ label: "Count", value: "count" }, { label: "Size", value: "size" }]}
                    onChange={(e) => setChartMode(e.value)}
                    className="p-buttonset-sm"
                  />
                </div>
                <div className="flex justify-content-center">
                  {chartConfig.chartData ? (
                    <div style={{ maxWidth: "280px", width: "100%" }}>
                      <Chart
                        type="doughnut"
                        data={chartConfig.chartData}
                        options={chartConfig.chartOptions}
                        plugins={[centerTextPlugin]}
                      />
                    </div>
                  ) : (
                    <div className="flex align-items-center justify-content-center text-color-secondary py-6 opacity-50">
                      No file type data
                    </div>
                  )}
                </div>
                <div className="text-center text-xs text-color-secondary mt-2 opacity-70">
                  Click on a segment to explore files
                </div>
              </Card>
            </div>
          </div>
        </div>

        {/* Right Column: Recent Files Sidebar */}
        <div className="col-12 xl:col-4">
          {recentFiles.length > 0 && (
            <div className="flex flex-column gap-3 h-full">
              <div className="flex align-items-center justify-content-between px-2">
                <span className="font-bold text-lg text-color">Recent Activity</span>
                <span className="text-xs text-color-secondary">{recentFiles.length} items</span>
              </div>
              <div className="flex flex-column gap-2 overflow-y-auto pr-1" style={{ flex: '1 1 0', minHeight: '300px' }}>
                {recentFiles.map((file, index) => (
                  <div
                    key={file.file_path || index}
                    className="flex align-items-center gap-3 p-2 border-round-xl bg-white border-1 border-transparent shadow-1 hover:shadow-2 hover:border-primary"
                    style={{ transition: "all 0.2s ease" }}
                    onContextMenu={(e) => handleContextMenu(e, file.file_path)}
                  >
                    <div className="flex align-items-center justify-content-center bg-primary-reverse border-round-lg" style={{ width: '36px', height: '36px' }}>
                      <i className={`${getFileIcon(file.file_extension)} text-lg text-primary`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-overflow-ellipsis white-space-nowrap overflow-hidden text-color">
                        {getFileName(file.file_path)}
                      </div>
                      <div className="text-xs text-color-secondary mt-0 flex align-items-center gap-1 opacity-80" style={{ fontSize: '11px' }}>
                        <span>{formatBytes(file.file_size)}</span>
                        <span className="opacity-50">•</span>
                        <span>{formatRelativeTime(file.indexed_at)}</span>
                      </div>
                    </div>
                    <div 
                      className="flex align-items-center justify-content-center cursor-pointer text-color-secondary hover:text-primary transition-colors px-2 hero-action-tooltip"
                      onClick={() => handleFileOperation({ file_path: file.file_path, operation: 'file' })}
                      data-pr-tooltip="Open File"
                    >
                      <i className="fa-solid fa-arrow-up-right-from-square text-xs" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Tooltip target=".hero-action-tooltip" />

      {/* Empty State */}
      {(!stats || stats.totals.indexed === 0) && (
        <Card className="text-center" style={{ backgroundColor: "var(--blue-50)", border: "2px dashed var(--primary-color)" }}>
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

      {/* Drill-down Dialog */}
      {/* Drill-down Sidebar */}
      <Sidebar
        visible={drillDownVisible}
        position="bottom"
        onHide={() => setDrillDownVisible(false)}
        style={{ height: 'auto', minHeight: '400px' }}
        header={
          <div className="flex align-items-center gap-2">
            <i className="fa-solid fa-folder-open text-primary text-xl" />
            <span className="font-bold text-xl">Files: {drillDownExt}</span>
            <span className="text-sm text-color-secondary ml-2">{drillDownTotal} items</span>
          </div>
        }
      >
        {drillDownLoading ? (
          <div className="flex justify-content-center py-8">
            <i className="fa fa-spinner fa-spin text-4xl text-primary" />
          </div>
        ) : (
          <div className="flex flex-column h-full">
            <div className="grid mt-2">
              {drillDownFiles.map((file, idx) => (
                <div key={file.file_path || idx} className="col-12 md:col-6 lg:col-4 xl:col-3">
                  <div 
                    className="flex align-items-center gap-3 p-2 border-round-xl bg-white border-1 border-transparent shadow-1 hover:shadow-2 hover:border-primary transition-all"
                  >
                    <div className="flex align-items-center justify-content-center bg-primary-reverse border-round-lg" style={{ width: '40px', height: '40px', flexShrink: 0 }}>
                      <i className={`${getFileIcon(file.file_extension)} text-xl text-primary`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-overflow-ellipsis white-space-nowrap overflow-hidden text-color" title={getFileName(file.file_path)}>
                        {getFileName(file.file_path)}
                      </div>
                      <div className="text-xs text-color-secondary mt-1 flex align-items-center gap-1 opacity-80" style={{ fontSize: '11px' }}>
                        <span>{formatBytes(file.file_size)}</span>
                        <span className="opacity-50">•</span>
                        <span>{formatRelativeTime(file.indexed_at)}</span>
                      </div>
                    </div>
                    <div 
                      className="flex align-items-center justify-content-center cursor-pointer text-color-secondary hover:text-primary transition-colors px-2 hero-action-tooltip"
                      onClick={() => handleFileOperation({ file_path: file.file_path, operation: 'file' })}
                      data-pr-tooltip="Open File"
                    >
                      <i className="fa-solid fa-arrow-up-right-from-square text-sm" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-auto flex justify-content-center">
              <Paginator
                first={drillDownPage * 20}
                rows={20}
                totalRecords={drillDownTotal}
                onPageChange={(e) => {
                  setDrillDownPage(e.page);
                  loadDrillDownFiles(drillDownExt, e.page + 1);
                }}
              />
            </div>
          </div>
        )}
      </Sidebar>

      <WatchedFoldersSidebar
        visible={watchedFoldersVisible}
        onHide={() => setWatchedFoldersVisible(false)}
      />

       {/* Index Management Sidebar */}
       <IndexManagementSidebar
        visible={indexManagementVisible}
        onHide={() => setIndexManagementVisible(false)}
      />

      {/* Context Menu */}
      <FileContextMenu
        isOpen={contextMenu.visible}
        position={contextMenu.position}
        filePath={contextMenu.filePath}
        onClose={() => setContextMenu((prev) => ({ ...prev, visible: false }))}
        onFileOperation={handleFileOperation}
      />
    </div>
  );
};
