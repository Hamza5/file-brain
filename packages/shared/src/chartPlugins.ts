/**
 * Chart.js plugin for displaying center text in doughnut charts
 * Shared between the main app and website mockup
 */

export const centerTextPlugin = {
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
