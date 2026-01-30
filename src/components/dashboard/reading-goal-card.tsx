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
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDialogState } from "@/hooks/ui";
import { handleTRPCError } from "@/lib/common";
import { cn } from "@/lib/utils";

interface ReadingGoalCardProps {
  currentCount: number;
  goal: number;
  progressPercentage: number;
  isOnTrack: boolean;
  expectedAtThisPoint: number;
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
  expectedAtThisPoint,
  setThreshold,
  isSettingThreshold,
  className,
}: ReadingGoalCardProps): React.ReactElement => {
  const [newThresholdValue, setNewThresholdValue] = useState<number>(threshold);
  const {
    isOpen: isThresholdDialogOpen,
    handleOpenChange: handleDialogOpenChange,
  } = useDialogState({
    preventClose: isSettingThreshold,
    onClose: () => setNewThresholdValue(threshold),
  });

  return (
    <Card className={cn("h-40 w-full", className)}>
      <CardContent className="flex w-full justify-between">
        <div className="mt-2 flex w-full -translate-y-3 flex-col items-center gap-y-1">
          <span className="text-xs font-semibold lg:hidden">READING GOAL</span>
          <p className="hidden items-center gap-x-1 text-center text-sm font-semibold lg:flex lg:whitespace-nowrap">
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
                    {isSettingThreshold ? <Spinner /> : "Submit"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <span> read so far</span>
          </p>
          <Progress
            value={progressPercentage}
            className="my-1 h-4 w-full lg:w-2/3"
          />
          <div className="flex flex-col items-center gap-x-4 text-center lg:flex-row">
            <div className="flex items-center gap-x-2">
              <span className="text-sm">{`${progressPercentage}% complete`}</span>
              {isOnTrack ? (
                <TrendingUp className="size-8 text-green-500" />
              ) : (
                <AlertCircle className="size-8 text-amber-500" />
              )}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="hidden cursor-pointer text-sm underline decoration-dotted lg:flex">
                  {paceMessage}
                </span>
              </TooltipTrigger>
              <TooltipContent>{`At this point you should have read ${expectedAtThisPoint} books`}</TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center justify-center gap-x-2">
            <span className="text-sm font-semibold whitespace-nowrap lg:whitespace-normal">
              Current goal: {goal}
            </span>
            <Button variant={"ghost"} size={"icon"} onClick={onEditClick}>
              <EditIcon />
            </Button>
          </div>
        </div>
        <TargetIcon className="hidden lg:ml-2 lg:flex" />
      </CardContent>
    </Card>
  );
};

export default ReadingGoalCard;
