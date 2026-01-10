import { useState } from "react";

import { DropdownMenuTrigger } from "@radix-ui/react-dropdown-menu";
import { toast } from "sonner";

import type { Book } from "@/generated/prisma/client";
import { useProgressValidation } from "@/hooks/use-progress-validation";
import { trpc } from "@/trpc/client";

import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../ui/dropdown-menu";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Spinner } from "../ui/spinner";
import { Textarea } from "../ui/textarea";

const UpdateReadingProgressCard = ({ book }: { book: Book }) => {
  const { pageCount, progress } = book;
  const utils = trpc.useUtils();

  const [selectedProgressType, setSelectedProgressType] = useState<
    "%" | "pages"
  >("%");
  const [enteredComments, setEnteredComments] = useState<string>("");
  const { mutate: updateReadingProgress, isPending } =
    trpc.readingProgress.createReadingProgressInstance.useMutation({
      onSuccess: () => {
        utils.book.getBook.invalidate();
        utils.readingProgress.getProgressHistory.invalidate();
        resetProgressInput();
        setEnteredComments("");
        toast.success("Successfully updated reading progress.");
      },
    });
  const {
    inputValue: progressValue,
    error: progressValidationError,
    isValid: isValidProgress,
    handleChange: handleProgressChange,
    resetInput: resetProgressInput,
  } = useProgressValidation(book, selectedProgressType);

  return (
    <Card className="bg-card/40 h-80 w-3/4 rounded-[6px]">
      <CardContent>
        <div className="flex h-full flex-col gap-y-2">
          <div className="flex gap-x-6">
            <div className="relative flex w-1/3 flex-col items-center gap-y-2">
              <Label htmlFor="value">{`Progress (${selectedProgressType})`}</Label>
              <Input
                id="value"
                type="number"
                step="1"
                className={`rounded-[6px] ${progressValidationError ? "border-red-500" : ""}`}
                placeholder={
                  selectedProgressType === "%"
                    ? progress.toString()
                    : Math.floor((progress / 100) * pageCount).toString()
                }
                value={progressValue}
                onChange={(e) => handleProgressChange(e.target.value)}
              />
              {progressValidationError && (
                <p className="absolute -bottom-6 left-0 text-xs whitespace-nowrap text-red-400">
                  {progressValidationError}
                </p>
              )}
            </div>
            <div className="flex w-1/3 flex-col items-center gap-y-2">
              <Label htmlFor="progressType">Progress Type</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="dark:bg-primary w-full cursor-pointer rounded-[6px]">
                    {selectedProgressType}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onClick={() => setSelectedProgressType("%")}
                  >
                    %
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setSelectedProgressType("pages")}
                  >
                    pages
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex w-1/3 items-end">
              <Button
                className="w-full cursor-pointer rounded-[6px]"
                disabled={isPending || !isValidProgress}
                onClick={() => {
                  const basePayload = {
                    bookId: book.id,
                    comments: enteredComments || undefined,
                  };

                  if (selectedProgressType === "%") {
                    updateReadingProgress({
                      ...basePayload,
                      newProgress: parseInt(progressValue),
                    });
                  } else {
                    updateReadingProgress({
                      ...basePayload,
                      newPagesRead: parseInt(progressValue),
                    });
                  }
                }}
              >
                {isPending ? <Spinner /> : "Submit"}
              </Button>
            </div>
          </div>
          <div className="mt-4 flex h-full w-full flex-col items-center gap-y-2">
            <Label>Comments</Label>
            <Textarea
              className="h-full min-h-45 resize-none"
              value={enteredComments}
              onChange={(e) => setEnteredComments(e.target.value)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default UpdateReadingProgressCard;
