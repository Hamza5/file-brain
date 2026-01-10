import React, { useEffect, useMemo, useState } from 'react';
import { Card } from 'primereact/card';
import { Chart } from 'primereact/chart';
import { SelectButton } from 'primereact/selectbutton';
import { Tooltip } from 'primereact/tooltip';
import { getIndexingActivity, type IndexingActivityResponse } from '../../api/client';

interface IndexingActivityChartProps {
  className?: string;
}

export const IndexingActivityChart: React.FC<IndexingActivityChartProps> = ({ className }) => {
  const [activityData, setActivityData] = useState<IndexingActivityResponse | null>(null);
  const [activityRange, setActivityRange] = useState<"24h" | "7d">("24h");

  // Fetch indexing activity
  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const result = await getIndexingActivity(activityRange);
        setActivityData(result);
      } catch {
        // Failed to fetch indexing activity - silent failure
      }
    };
    fetchActivity();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchActivity, 30000);
    return () => clearInterval(interval);
  }, [activityRange]);

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

  return (
    <Card className={`h-full border-round-2xl shadow-2 surface-card ${className || ''}`} pt={{ content: { className: 'p-3' } }}>
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

      <Tooltip target=".help-activity" position="bottom" className="text-sm" style={{ maxWidth: '250px' }}>
        Shows how many files were processed over time. Toggle between last 24 hours or 7 days.
      </Tooltip>
    </Card>
  );
};
