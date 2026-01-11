import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from 'primereact/card';
import { Chart } from 'primereact/chart';
import { SelectButton } from 'primereact/selectbutton';
import { Tooltip } from 'primereact/tooltip';
import { getStorageByType } from '../../api/client';
import { formatBytes } from '../../utils/fileUtils';
import { centerTextPlugin } from './chartPlugins';

interface FileTypeChartProps {
  fileTypes: Record<string, number> | undefined;
  onSegmentClick: (ext: string) => void;
}

export const FileTypeChart: React.FC<FileTypeChartProps> = ({ fileTypes, onSegmentClick }) => {
  const [chartMode, setChartMode] = useState<"count" | "size">("count");
  const [storageByType, setStorageByType] = useState<Record<string, number>>({});
  const hasRenderedChart = useRef(false);

  // Fetch storage by type for size mode
  useEffect(() => {
    if (chartMode === "size") {
      const fetchStorage = async () => {
        try {
          const result = await getStorageByType();
          setStorageByType(result.storage);
        } catch {
          // Failed to fetch storage by type - silent failure
        }
      };
      fetchStorage();
    }
  }, [chartMode]);

  // Chart configuration
  const chartConfig = useMemo(() => {
    const source = chartMode === "count" ? fileTypes : storageByType;
    if (!source || Object.keys(source).length === 0) {
      return { chartData: null, chartOptions: null };
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
        borderWidth: 0,
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
          if (ext && ext !== "Other") onSegmentClick(ext);
        }
      },
    };

    return { chartData: data, chartOptions: options };
  }, [fileTypes, storageByType, chartMode, onSegmentClick]);

  return (
    <Card className="h-full border-round-2xl shadow-2 surface-card" pt={{ content: { className: 'p-3' } }}>
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

      <Tooltip target=".help-filetypes" position="bottom" className="text-sm" style={{ maxWidth: '250px' }}>
        Distribution of file types. Switch between count and storage size. Click a segment to see files.
      </Tooltip>
    </Card>
  );
};
