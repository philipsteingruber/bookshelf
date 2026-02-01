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
import {
  aggregateByDay,
  calculateTrendline,
  ensureZeroBaseline,
  formatRelativeDateCompact,
  formatRelativeDatePrecise,
} from "@/lib/reading";
import type {
  ChartDataPoint,
  ReadingProgressWithProgressSinceLast,
} from "@/lib/types";
import { cn } from "@/lib/utils";

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
  className,
}: {
  readingHistory: ReadingProgressWithProgressSinceLast[];
  className?: string;
}): React.ReactElement => {
  // Aggregate by day (used for trendline calculation - real data only)
  const aggregatedData = aggregateByDay(readingHistory);
  // Add synthetic 0% baseline for display (visual anchor only)
  const displayData = ensureZeroBaseline(aggregatedData);

  // Check minimum data (use real data count, not including synthetic entry)
  if (aggregatedData.length < 3) {
    return (
      <div className="border-primary flex h-[368px] w-full max-w-4xl items-center justify-center rounded-lg border-2">
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

  // Prepare chart data points for display (includes synthetic 0% baseline)
  const chartDataPoints: ChartDataPoint[] = displayData.map((entry) => ({
    date: entry.createdAt,
    displayDate: formatRelativeDateCompact(entry.createdAt),
    progress: entry.progress,
    progressSinceLast: entry.progressSinceLast,
    comments: entry.comments,
    fullDate: entry.createdAt.toLocaleString(),
    originalEntry: entry,
  }));

  // Prepare data points for trendline (real data only, excludes synthetic baseline)
  const trendlineSourcePoints: ChartDataPoint[] = aggregatedData.map(
    (entry) => ({
      date: entry.createdAt,
      displayDate: formatRelativeDateCompact(entry.createdAt),
      progress: entry.progress,
      progressSinceLast: entry.progressSinceLast,
      comments: entry.comments,
      fullDate: entry.createdAt.toLocaleString(),
      originalEntry: entry,
    }),
  );

  // Calculate trendline from real data only
  const { trendlineData } = calculateTrendline(trendlineSourcePoints);

  // Merge actual progress data with trendline data
  // Account for synthetic baseline offset (trendline is calculated from real data only)
  const syntheticOffset = displayData.length - aggregatedData.length;
  const chartData: {
    date: string;
    tooltipDate: string;
    progress?: number;
    trend?: number;
    progressSinceLast: number;
    entry: ReadingProgressWithProgressSinceLast | null;
  }[] = chartDataPoints.map((point, index) => ({
    date: point.displayDate,
    tooltipDate: formatRelativeDatePrecise(point.date),
    progress: point.progress,
    // Synthetic baseline (index 0 when offset=1) has no trendline value
    trend:
      index >= syntheticOffset
        ? trendlineData[index - syntheticOffset]?.trend
        : undefined,
    progressSinceLast: point.progressSinceLast,
    entry: point.originalEntry,
  }));

  // Add extended trendline points if they exist
  const realDataPointsCount = chartDataPoints.length - syntheticOffset;
  if (trendlineData.length > realDataPointsCount) {
    for (let i = realDataPointsCount; i < trendlineData.length; i++) {
      chartData.push({
        date: trendlineData[i].displayDate,
        tooltipDate: trendlineData[i].displayDate,
        progress: undefined,
        trend: trendlineData[i].trend,
        progressSinceLast: 0,
        entry: null,
      });
    }
  }

  return (
    <div
      className={cn(
        "border-primary h-[368px] w-full max-w-4xl rounded-lg border-2 p-4",
        className,
      )}
    >
      <ChartContainer config={chartConfig} className="h-full w-full">
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
                labelKey="tooltipDate"
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
