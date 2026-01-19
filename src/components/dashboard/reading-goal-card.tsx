"use client";

import { useState } from "react";

import { AlertCircle, EditIcon, TargetIcon, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { handleTRPCError } from "@/lib/error-handler";
import { cn } from "@/lib/utils";

interface ReadingGoalCardProps {
  currentCount: number;
  goal: number;
  progressPercentage: number;
  isOnTrack: boolean;
  paceMessage: string;
  threshold: number;
  setThreshold: (newThreshold: number) => Promise<void>;
  isSettingThreshold: boolean;
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
  setThreshold,
  isSettingThreshold,
  className,
}: ReadingGoalCardProps) => {
  const [newThresholdValue, setNewThresholdValue] = useState<number>(threshold);
  const [isThresholdDialogOpen, setIsThresholdDialogOpen] =
    useState<boolean>(false);

  const handleDialogOpenChange = (open: boolean) => {
    if (open === false && isSettingThreshold) {
      return;
    }
    if (open === false) {
      setNewThresholdValue(threshold);
    }
    setIsThresholdDialogOpen(open);
  };

  return (
    <Card className={cn("h-40 w-2/5", className)}>
      <CardContent className="flex w-full justify-between">
        <div className="mt-2 flex w-full flex-col items-center gap-y-1">
          <p className="flex items-center gap-x-1 text-center text-lg font-bold whitespace-nowrap">
            <span>{`${currentCount} of ${goal} books`}</span>
            <Dialog
              open={isThresholdDialogOpen}
              onOpenChange={handleDialogOpenChange}
            >
              <DialogTrigger>
                <span className="cursor-pointer underline decoration-dotted hover:decoration-solid">
                  {" "}
                  {`(over ${threshold} pages long)`}
                </span>
              </DialogTrigger>
              <DialogContent className="flex flex-col items-center">
                <DialogHeader>
                  <DialogTitle className="text-center whitespace-nowrap">
                    New Pagecount Threshold
                  </DialogTitle>
                  <DialogDescription className="text-center">
                    Choose new Pagecount Threshold (only books longer than this
                    threshold count towards your reading goal)
                  </DialogDescription>
                </DialogHeader>
                <div className="flex w-1/2 gap-x-2">
                  <Input
                    type="number"
                    step={1}
                    value={newThresholdValue}
                    onChange={(e) =>
                      setNewThresholdValue(parseInt(e.target.value, 10))
                    }
                    disabled={isSettingThreshold}
                  />
                  <Button
                    onClick={() =>
                      setThreshold(newThresholdValue)
                        .then(() => {
                          toast.success(
                            "Pagecount threshold updated successfully",
                          );
                          handleDialogOpenChange(false);
                        })
                        .catch((err) => handleTRPCError(err))
                    }
                    disabled={
                      isSettingThreshold ||
                      isNaN(newThresholdValue) ||
                      newThresholdValue < 0
                    }
                  >
                    Submit
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <span> read this year</span>
          </p>
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
