import { useStatus } from "../context/StatusContext";
import { useNotification } from "../context/NotificationContext";
import { Chart } from "primereact/chart";
import { Card } from "primereact/card";
import { useMemo } from "react";

interface StatCardProps {
  label: string;
  value: number;
}

export function StatsPage() {
  const { stats, status, isLive, lastUpdate, isLoading, error } = useStatus();
  const { showError } = useNotification();

  const totals = stats?.totals;
  const ratios = stats?.ratios;
  const fileTypes = stats?.file_types ?? {};
  const healthy = stats?.healthy ?? false;

  const discovered = totals?.discovered ?? 0;
  const indexed = totals?.indexed ?? 0;
  const remaining = Math.max(discovered - indexed, 0);

  // Build Chart.js datasets/options using PrimeReact CSS variables resolved via getComputedStyle,
  // following the official pattern so colors track the active theme.
  const {
    coverageData,
    coverageOptions,
    fileTypesData,
    fileTypesOptions,
  } = useMemo(() => {
    // In non-browser environments (SSR / tests), guard against missing document.
    if (typeof document === "undefined") {
      return {
        coverageData: null,
        coverageOptions: {},
        fileTypesData: null,
        fileTypesOptions: {},
      };
    }

    const documentStyle = getComputedStyle(document.documentElement);

    const textSecondary =
      documentStyle.getPropertyValue("--text-color-secondary").trim() ||
      "#6B7280";

    // Index coverage colors
    const indexedBg =
      documentStyle.getPropertyValue("--green-500").trim() || "#10B981";
    const indexedHover =
      documentStyle.getPropertyValue("--green-400").trim() || "#22C55E";
    const remainingBg =
      documentStyle.getPropertyValue("--surface-200").trim() || "#E5E7EB";
    const remainingHover =
      documentStyle.getPropertyValue("--surface-300").trim() || "#D1D5DB";

    const basePieOptions = {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: textSecondary,
            font: { size: 12 },
            usePointStyle: true,
          },
        },
      },
    };

    const coverageDataLocal =
      discovered > 0
        ? {
            labels: ["Indexed", "Remaining"],
            datasets: [
              {
                data: [indexed, remaining],
                backgroundColor: [indexedBg, remainingBg],
                hoverBackgroundColor: [indexedHover, remainingHover],
                borderColor: [indexedBg, remainingBg],
                borderWidth: 1,
              },
            ],
          }
        : null;

    // File types palette from PrimeReact variables with fallbacks.
    const palette = [
      documentStyle.getPropertyValue("--blue-500").trim() || "#3B82F6",
      documentStyle.getPropertyValue("--green-500").trim() || "#22C55E",
      documentStyle.getPropertyValue("--yellow-500").trim() || "#EAB308",
      documentStyle.getPropertyValue("--cyan-500").trim() || "#06B6D4",
      documentStyle.getPropertyValue("--pink-500").trim() || "#EC4899",
      documentStyle.getPropertyValue("--indigo-500").trim() || "#6366F1",
      documentStyle.getPropertyValue("--teal-500").trim() || "#14B8A6",
      documentStyle.getPropertyValue("--orange-500").trim() || "#F97316",
      documentStyle.getPropertyValue("--purple-500").trim() || "#8B5CF6",
      documentStyle.getPropertyValue("--red-500").trim() || "#EF4444",
    ];

    const fileTypeEntries = Object.entries(fileTypes).sort(
      (a, b) => b[1] - a[1]
    );

    const fileTypesDataLocal =
      fileTypeEntries.length > 0
        ? {
            labels: fileTypeEntries.map(([ext]) => ext || "unknown"),
            datasets: [
              {
                data: fileTypeEntries.map(([, count]) => count),
                backgroundColor: fileTypeEntries.map(
                  (_, idx) => palette[idx % palette.length]
                ),
                hoverBackgroundColor: fileTypeEntries.map(
                  (_, idx) => palette[idx % palette.length]
                ),
                borderColor: fileTypeEntries.map(
                  (_, idx) => palette[idx % palette.length]
                ),
                borderWidth: 1,
              },
            ],
          }
        : null;

    return {
      coverageData: coverageDataLocal,
      coverageOptions: basePieOptions,
      fileTypesData: fileTypesDataLocal,
      fileTypesOptions: basePieOptions,
    };
  }, [discovered, indexed, remaining, fileTypes]);

  if (error) {
    showError("Failed to load crawl statistics", error);
  }

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
          <span
            style={{
              color: isLive ? "var(--blue-500)" : "var(--orange-400)",
              fontWeight: 600,
            }}
          >
            {isLive ? "Live (SSE)" : "Polling"}
          </span>
        </div>
        <div>
          Status:{" "}
          <span
            style={{
              color: status?.running ? "var(--green-500)" : "var(--text-color)",
              fontWeight: 600,
            }}
          >
            {status?.running ? "Running" : "Idle"}
          </span>
        </div>
        <div>
          Typesense:{" "}
          <span
            style={{
              color: healthy ? "var(--green-500)" : "var(--red-500)",
              fontWeight: 600,
            }}
          >
            {healthy ? "Healthy" : "Unavailable"}
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
          {coverageData ? (
            <>
              <div style={{ height: "270px" }}>
                <Chart
                  type="pie"
                  data={coverageData}
                  options={coverageOptions}
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

        {/* Pie Chart: File Types Distribution */}
        <Card style={{ border: "1px solid var(--surface-border)" }}>
          <h3
            style={{
              margin: "0 0 1rem 0",
              fontSize: "1rem",
              fontWeight: 600,
              color: "var(--text-color)",
            }}
          >
            Indexed File Types
          </h3>
          {fileTypesData ? (
            <div style={{ height: "270px" }}>
              <Chart
                type="pie"
                data={fileTypesData}
                options={fileTypesOptions}
              />
            </div>
          ) : (
            <div style={{ fontSize: "0.9rem", color: "var(--text-color-secondary)" }}>
              No file type data available yet. Start a crawl to populate statistics.
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
