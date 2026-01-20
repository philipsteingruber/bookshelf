import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEstimatedDate } from "@/lib/chart-utils";

interface ReadingProgressEstimateCardProps {
  currentProgress: number;
  estimatedDate: Date | null;
  daysRemaining: number | null;
  slope: number;
  pageCount: number;
}

export const ReadingProgressEstimateCard = ({
  currentProgress,
  estimatedDate,
  daysRemaining,
  slope,
  pageCount,
}: ReadingProgressEstimateCardProps) => {
  const isFinished = currentProgress >= 100;
  const canEstimate = slope > 0 && !isFinished;

  return (
    <Card className="h-fit min-w-[250px]">
      <CardHeader>
        <CardTitle className="text-lg">Reading Pace</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Current progress */}
        <div>
          <p className="text-muted-foreground text-sm">Current Progress</p>
          <p className="text-primary text-2xl font-bold">{currentProgress}%</p>
        </div>

        {/* Daily pace */}
        <div>
          <p className="text-muted-foreground text-sm">Average Pace</p>
          <p className="text-lg font-semibold">
            {slope > 0
              ? `${slope.toFixed(1)}% (${((parseFloat(slope.toFixed(1)) / 100) * pageCount).toFixed(1)} pages) per day`
              : "Not enough data"}
          </p>
        </div>

        {/* Estimated completion */}
        {canEstimate && estimatedDate && daysRemaining && (
          <div className="border-border border-t pt-2">
            <p className="text-muted-foreground text-sm">Estimated Finish</p>
            <p className="text-foreground text-lg font-semibold">
              {formatEstimatedDate(estimatedDate)}
            </p>
            <p className="text-muted-foreground text-sm">
              ({daysRemaining} {daysRemaining === 1 ? "day" : "days"} remaining)
            </p>
          </div>
        )}

        {/* Finished state */}
        {isFinished && (
          <div className="border-border border-t pt-2">
            <p className="text-foreground text-lg font-semibold">
              Book completed!
            </p>
          </div>
        )}

        {/* No progress state */}
        {!canEstimate && !isFinished && (
          <p className="text-muted-foreground pt-2 text-sm italic">
            Keep reading to see your estimated finish date
          </p>
        )}
      </CardContent>
    </Card>
  );
};
