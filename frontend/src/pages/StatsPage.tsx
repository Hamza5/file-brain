import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, XAxis, YAxis, Bar, CartesianGrid, Legend } from "recharts";
import { useStatus } from "../context/StatusContext";

const PIE_COLORS = ["#22c55e", "#334155"];

export function StatsPage() {
  const { stats, status, isLive, lastUpdate, isLoading, error } = useStatus();

  const totals = stats?.totals;
  const ratios = stats?.ratios;

  const discovered = totals?.discovered ?? 0;
  const indexed = totals?.indexed ?? 0;
  const remaining = Math.max(discovered - indexed, 0);

  const pieData =
    discovered > 0
      ? [
          { name: "Indexed", value: indexed },
          { name: "Remaining", value: remaining },
        ]
      : [];

  // Placeholder hourly data (backend currently returns empty arrays; UI stays stable).
  const hourlyData = stats?.timeseries.indexed_per_hour ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Stats</h1>
          <p className="text-xs text-slate-400">
            Monitor crawl progress, index coverage, and system health in real time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
          <span>
            Stream:{" "}
            <span className={isLive ? "text-sky-400" : "text-amber-400"}>
              {isLive ? "Live (SSE)" : "Polling"}
            </span>
          </span>
          <span>
            Status:{" "}
            <span className={status?.running ? "text-emerald-400" : "text-slate-400"}>
              {status?.running ? "Running" : "Idle"}
            </span>
          </span>
          <span>
            Updated:{" "}
            <span className="text-slate-300">
              {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : "—"}
            </span>
          </span>
        </div>
      </div>

      {isLoading && (
        <div className="text-xs text-slate-400">Loading stats…</div>
      )}

      {error && (
        <div className="text-xs text-rose-400">
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Discovered" value={discovered} />
        <StatCard label="Indexed" value={indexed} />
        <StatCard label="Skipped" value={totals?.skipped ?? 0} />
        <StatCard label="Failed" value={totals?.failed ?? 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie: Indexed vs Discovered */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
          <div className="text-xs text-slate-300 mb-2">
            Index coverage
          </div>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={PIE_COLORS[index % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#020817",
                    borderColor: "#1e293b",
                    borderRadius: 6,
                    fontSize: 10,
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 10, color: "#9ca3af" }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-[10px] text-slate-500">
              No discovered files yet. Start a crawl to populate statistics.
            </div>
          )}
          <div className="mt-2 text-[10px] text-slate-400">
            Indexed ratio:{" "}
            <span className="text-sky-400">
              {ratios
                ? `${(ratios.indexed_vs_discovered * 100).toFixed(1)}%`
                : "—"}
            </span>
          </div>
        </div>

        {/* Bar: Indexed files per hour (placeholder-safe) */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
          <div className="text-xs text-slate-300 mb-2">
            Indexed files per hour
          </div>
          {hourlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" />
                <XAxis
                  dataKey="bucket"
                  tick={{ fontSize: 9, fill: "#9ca3af" }}
                />
                <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#020817",
                    borderColor: "#1e293b",
                    borderRadius: 6,
                    fontSize: 10,
                  }}
                />
                <Bar dataKey="count" fill="#38bdf8" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-[10px] text-slate-500">
              No hourly breakdown available yet. This will populate as we
              collect more crawl history.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2">
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className="text-lg font-semibold text-slate-50">
        {value.toLocaleString()}
      </div>
    </div>
  );
}