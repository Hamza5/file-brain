import { useStatus } from "../context/StatusContext";
import { useNotification } from "../context/NotificationContext";
import { Chart } from "primereact/chart";
import { Card } from "primereact/card";

interface StatCardProps {
  label: string;
  value: number;
}

export function StatsPage() {
  const { stats, status, isLive, lastUpdate, isLoading, error } = useStatus();
  const { showError } = useNotification();

  const totals = stats?.totals;
  const ratios = stats?.ratios;

  const discovered = totals?.discovered ?? 0;
  const indexed = totals?.indexed ?? 0;
  const remaining = Math.max(discovered - indexed, 0);

  const pieData =
    discovered > 0
      ? {
          labels: ["Indexed", "Remaining"],
          datasets: [
            {
              data: [indexed, remaining],
              backgroundColor: ["var(--green-500)", "var(--surface-border)"],
              hoverBackgroundColor: ["var(--green-400)", "var(--surface-500)"],
            },
          ],
        }
      : null;

  const hourlyData = stats?.timeseries.indexed_per_hour ?? [];
  const barData =
    hourlyData.length > 0
      ? {
          labels: hourlyData.map((h) => h.bucket),
          datasets: [
            {
              label: "Indexed files",
              data: hourlyData.map((h) => h.count),
              backgroundColor: "var(--blue-400)",
              borderColor: "var(--blue-600)",
              borderRadius: 4,
            },
          ],
        }
      : null;

  if (error) {
    showError("Failed to load crawl statistics", error);
  }

  const chartOptions = {
    animation: false,
    responsive: true,
    maintainAspectRatio: false,
  };

  const pieOptions = {
    ...chartOptions,
    plugins: {
      legend: {
        labels: {
          color: "var(--text-color-secondary)",
          font: { size: 12 },
        },
      },
    },
  };

  const barOptions = {
    ...chartOptions,
    indexAxis: "x" as const,
    plugins: {
      legend: {
        labels: {
          color: "var(--text-color-secondary)",
          font: { size: 12 },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: "var(--text-color-secondary)",
          font: { size: 10 },
        },
        grid: {
          display: false,
        },
      },
      y: {
        ticks: {
          color: "var(--text-color-secondary)",
          font: { size: 10 },
        },
        grid: {
          color: "var(--surface-border)",
        },
      },
    },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: "1.75rem",
            fontWeight: 600,
            color: "var(--text-color)",
          }}
        >
          Stats
        </h1>
        <p
          style={{
            margin: "0.5rem 0 0 0",
            fontSize: "0.9rem",
            color: "var(--text-color-secondary)",
          }}
        >
          Monitor crawl progress, index coverage, and system health in real time.
        </p>
      </div>

      {/* Status Info */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          flexWrap: "wrap",
          fontSize: "0.9rem",
        }}
      >
        <div>
          Stream:{" "}
          <span style={{ color: isLive ? "var(--blue-500)" : "var(--orange-400)", fontWeight: 600 }}>
            {isLive ? "Live (SSE)" : "Polling"}
          </span>
        </div>
        <div>
          Status:{" "}
          <span style={{ color: status?.running ? "var(--green-500)" : "var(--text-color)", fontWeight: 600 }}>
            {status?.running ? "Running" : "Idle"}
          </span>
        </div>
        <div>
          Updated:{" "}
          <span>
            {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : "—"}
          </span>
        </div>
      </div>

      {isLoading && (
        <div style={{ fontSize: "0.9rem", color: "var(--text-color-secondary)" }}>
          Loading stats…
        </div>
      )}

      {/* Summary Stats Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
        }}
      >
        <Card style={{ border: "1px solid var(--surface-border)" }}>
          <SummaryStat label="Discovered" value={discovered} />
        </Card>
        <Card style={{ border: "1px solid var(--surface-border)" }}>
          <SummaryStat label="Indexed" value={indexed} />
        </Card>
        <Card style={{ border: "1px solid var(--surface-border)" }}>
          <SummaryStat label="Skipped" value={totals?.skipped ?? 0} />
        </Card>
        <Card style={{ border: "1px solid var(--surface-border)" }}>
          <SummaryStat label="Failed" value={totals?.failed ?? 0} />
        </Card>
      </div>

      {/* Charts Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
          gap: "1rem",
        }}
      >
        {/* Pie Chart: Index Coverage */}
        <Card style={{ border: "1px solid var(--surface-border)" }}>
          <h3
            style={{
              margin: "0 0 1rem 0",
              fontSize: "1rem",
              fontWeight: 600,
              color: "var(--text-color)",
            }}
          >
            Index Coverage
          </h3>
          {pieData ? (
            <>
              <div style={{ height: "250px" }}>
                <Chart
                  type="pie"
                  data={pieData}
                  options={pieOptions}
                />
              </div>
              <div
                style={{
                  fontSize: "0.9rem",
                  marginTop: "1rem",
                  color: "var(--text-color-secondary)",
                }}
              >
                Indexed ratio:{" "}
                <span style={{ color: "var(--blue-500)", fontWeight: 600 }}>
                  {ratios
                    ? `${(ratios.indexed_vs_discovered * 100).toFixed(1)}%`
                    : "—"}
                </span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: "0.9rem", color: "var(--text-color-secondary)" }}>
              No discovered files yet. Start a crawl to populate statistics.
            </div>
          )}
        </Card>

        {/* Bar Chart: Indexed Files Per Hour */}
        <Card style={{ border: "1px solid var(--surface-border)" }}>
          <h3
            style={{
              margin: "0 0 1rem 0",
              fontSize: "1rem",
              fontWeight: 600,
              color: "var(--text-color)",
            }}
          >
            Indexed Files Per Hour
          </h3>
          {barData ? (
            <div style={{ height: "250px" }}>
              <Chart
                type="bar"
                data={barData}
                options={barOptions}
              />
            </div>
          ) : (
            <div style={{ fontSize: "0.9rem", color: "var(--text-color-secondary)" }}>
              No hourly breakdown available yet. This will populate as more crawl
              history is collected.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: StatCardProps) {
  return (
    <div>
      <div
        style={{
          fontSize: "0.85rem",
          color: "var(--text-color-secondary)",
          marginBottom: "0.5rem",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "1.75rem",
          fontWeight: 600,
          color: "var(--primary-color)",
        }}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}
