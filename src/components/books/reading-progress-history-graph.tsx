import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ReadingProgressWithProgressSinceLast } from "@/hooks/use-reading-history";
import {
  aggregateByDay,
  calculateTrendline,
  type ChartDataPoint,
  formatRelativeDate,
} from "@/lib/chart-utils";

const chartConfig = {
  progress: {
    label: "Progress",
    color: "oklch(0.5854 0.2041 277.1173)",
  },
  trend: {
    label: "Projected",
    color: "oklch(0.5106 0.2301 276.9656)",
  },
} satisfies ChartConfig;

const ReadingProgressHistoryGraph = ({
  readingHistory,
}: {
  readingHistory: ReadingProgressWithProgressSinceLast[];
}) => {
  // Aggregate by day
  const aggregatedData = aggregateByDay(readingHistory);

  // Check minimum data
  if (aggregatedData.length < 3) {
    return (
      <div className="border-primary mb-4 flex h-[300px] w-full max-w-4xl items-center justify-center rounded-lg border-2">
        <div className="px-4 text-center">
          <p className="text-foreground text-lg font-semibold">
            Keep tracking your progress!
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            Your reading trend will appear after reading for{" "}
            {3 - aggregatedData.length} more{" "}
            {aggregatedData.length === 2 ? "day" : "days"}.
          </p>
        </div>
      </div>
    );
  }

  // Prepare chart data points
  const chartDataPoints: ChartDataPoint[] = aggregatedData.map((entry) => ({
    date: entry.createdAt,
    displayDate: formatRelativeDate(entry.createdAt),
    progress: entry.progress,
    progressSinceLast: entry.progressSinceLast,
    comments: entry.comments,
    fullDate: entry.createdAt.toLocaleString(),
    originalEntry: entry,
  }));

  // Calculate trendline
  const { trendlineData } = calculateTrendline(chartDataPoints);

  // Merge actual progress data with trendline data
  const chartData: Array<{
    date: string;
    progress?: number;
    trend?: number;
    progressSinceLast: number;
    entry: ReadingProgressWithProgressSinceLast | null;
  }> = chartDataPoints.map((point, index) => ({
    date: point.displayDate,
    progress: point.progress,
    trend: trendlineData[index]?.trend,
    progressSinceLast: point.progressSinceLast,
    entry: point.originalEntry,
  }));

  // Add extended trendline points if they exist
  if (trendlineData.length > chartDataPoints.length) {
    for (let i = chartDataPoints.length; i < trendlineData.length; i++) {
      chartData.push({
        date: trendlineData[i].displayDate,
        progress: undefined,
        trend: trendlineData[i].trend,
        progressSinceLast: 0,
        entry: null,
      });
    }
  }

  return (
    <div className="border-primary mb-4 w-full max-w-4xl rounded-lg border-2 p-4">
      <ChartContainer config={chartConfig} className="h-[300px] w-full">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            className="text-xs"
          />
          <YAxis
            domain={[0, 100]}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value) => `${value}%`}
            className="text-xs"
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => {
                  if (name === "progress") {
                    return [
                      `${parseFloat(value as string).toFixed(1)}% `,
                      "Progress",
                    ];
                  }
                  if (name === "trend") {
                    return [
                      `${parseFloat(value as string).toFixed(1)}% `,
                      "Projected",
                    ];
                  }
                  return [value, name];
                }}
              />
            }
          />
          <ReferenceLine
            y={100}
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={1.5}
            strokeOpacity={0.5}
          />
          <Line
            type="monotone"
            dataKey="progress"
            stroke="var(--color-progress)"
            strokeWidth={2}
            dot={{
              fill: "var(--color-progress)",
              r: 4,
            }}
            activeDot={{
              r: 6,
            }}
          />
          <Line
            type="monotone"
            dataKey="trend"
            stroke="var(--color-trend)"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
};

export default ReadingProgressHistoryGraph;
