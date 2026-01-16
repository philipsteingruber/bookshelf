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
  className,
}: ReadingGoalCardProps) => {
  return (
    <Card className={cn("h-40 w-2/5", className)}>
      <CardContent className="flex w-full justify-between">
        <div className="mt-2 flex w-full flex-col gap-y-2">
          <span className="w-full text-center text-2xl font-bold">{`${currentCount} of ${goal} books read this year`}</span>
          <Progress value={progressPercentage} className="w-full" />
          <div className="flex items-center justify-around">
            <span className="text-xs">{`${progressPercentage}% complete`}</span>
            <div className="flex items-center gap-x-1">
              {isOnTrack ? (
                <TrendingUp className="text-green-500" />
              ) : (
                <AlertCircle className="text-amber-500" />
              )}
              <span className="text-primary text-xs">{paceMessage}</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-x-2">
            <span className="text-xs font-semibold">Current goal: {goal}</span>
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
