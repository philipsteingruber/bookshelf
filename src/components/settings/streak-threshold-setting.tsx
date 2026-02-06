import React, { useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useDialogState } from "@/hooks/ui";
import { handleTRPCError } from "@/lib/common";
import { trpc } from "@/trpc/client";

const StreakThresholdSetting = ({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement => {
  const [threshold, setThreshold] = useState<string>("");
  const utils = trpc.useUtils();
  const { data: stats } = trpc.user.getUserStats.useQuery();

  const { mutate: updateThreshold, isPending: isUpdatingThreshold } =
    trpc.user.setStreakThreshold.useMutation({
      onSuccess: () => {
        toast.success("Successfully updated streak threshold");
        utils.user.getUserStats.invalidate();
        utils.readingProgress.getRecentReadingProgress.invalidate();
        setIsOpen(false);
      },
      onError: (error) => {
        handleTRPCError(error);
      },
    });

  const currentThreshold = stats?.streakThreshold ?? 0;

  const validateThreshold = (value: string): number | null => {
    const intValue = parseInt(value, 10);
    if (isNaN(intValue) || intValue < 0) {
      return null;
    }
    return intValue;
  };
  const validatedThresholdValue = validateThreshold(threshold);

  const handleSave = (): void => {
    if (validatedThresholdValue === null) {
      toast.error("Please enter a valid number (0 or higher)");
      return;
    }
    updateThreshold(validatedThresholdValue);
  };

  const { isOpen, handleOpenChange, setIsOpen } = useDialogState({
    preventClose: isUpdatingThreshold,
    onClose: () => setThreshold(""),
  });

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger className="underline decoration-dotted">
        {children}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Minimum pages needed for streak</DialogTitle>
          <DialogDescription>
            Only days where you read at least this many pages will count toward
            your streak. Set to 0 to count any reading.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            id="streak-threshold"
            type="number"
            min={0}
            max={1000}
            step={1}
            placeholder={currentThreshold.toString()}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="w-32"
          />
          <Button
            onClick={handleSave}
            disabled={isUpdatingThreshold || validatedThresholdValue === null}
          >
            {isUpdatingThreshold ? <Spinner /> : "Save"}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Current: {currentThreshold} pages
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default StreakThresholdSetting;
