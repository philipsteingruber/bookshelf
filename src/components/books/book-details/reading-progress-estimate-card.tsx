import { addDays } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calculatePagesFromProgress } from "@/lib/book-utils";
import { formatEstimatedDate } from "@/lib/chart-utils";

interface ReadingProgressEstimateCardProps {
  currentProgress: number;
  estimatedDate: Date | null;
  daysRemaining: number | null;
  slope: number;
  pageCount: number;
  averagePace: number;
}

export const ReadingProgressEstimateCard = ({
  currentProgress,
  estimatedDate,
  slope,
  pageCount,
  averagePace,
}: ReadingProgressEstimateCardProps): React.ReactElement => {
  const isFinished = currentProgress >= 100;
  const canEstimate = slope > 0 && !isFinished;
  const daysRemaining = (100 - currentProgress) / averagePace;

  return (
    <Card className="border-primary h-full w-full flex-1 border-2">
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
            {averagePace > 0
              ? `${averagePace}% (${calculatePagesFromProgress(averagePace, pageCount)} pages) per day`
              : "Not enough data"}
          </p>
        </div>

        {/* Estimated completion */}
        {canEstimate && estimatedDate && daysRemaining && (
          <div className="border-border border-t pt-2">
            <p className="text-muted-foreground text-sm">Estimated Finish</p>
            <p className="text-foreground text-lg font-semibold">
              {formatEstimatedDate(
                addDays(new Date(), Math.round(daysRemaining)),
              )}
            </p>
            <p className="text-muted-foreground text-sm">
              ({daysRemaining.toFixed(1)} {daysRemaining === 1 ? "day" : "days"}{" "}
              remaining)
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
