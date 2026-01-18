import { AlertCircle, EditIcon, TargetIcon, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface ReadingGoalCardProps {
  currentCount: number;
  goal: number;
  progressPercentage: number;
  isOnTrack: boolean;
  paceMessage: string;
  threshold: number;
  onEditClick: () => void;
  className?: string;
}

const ReadingGoalCard = ({
  goal,
  onEditClick,
  currentCount,
  isOnTrack,
  paceMessage,
  progressPercentage,
  threshold,
  className,
}: ReadingGoalCardProps) => {
  return (
    <Card className={cn("h-40 w-2/5", className)}>
      <CardContent className="flex w-full justify-between">
        <div className="mt-2 flex w-full flex-col items-center gap-y-1">
          <span className="w-full text-center text-lg font-bold">{`${currentCount} of ${goal} books (over ${threshold} pages long) read this year`}</span>
          <Progress value={progressPercentage} className="h-4 w-3/4" />
          <div className="flex items-center gap-x-4">
            <span className="text-sm">{`${progressPercentage}% complete`}</span>
            {isOnTrack ? (
              <TrendingUp className="size-8 text-green-500" />
            ) : (
              <AlertCircle className="size-8 text-amber-500" />
            )}
            <span className="text-sm">{paceMessage}</span>
          </div>
          <div className="flex items-center justify-center gap-x-2">
            <span className="text-sm font-semibold">Current goal: {goal}</span>
            <Button variant={"ghost"} size={"icon"} onClick={onEditClick}>
              <EditIcon />
            </Button>
          </div>
        </div>
        <TargetIcon />
      </CardContent>
    </Card>
  );
};

export default ReadingGoalCard;
