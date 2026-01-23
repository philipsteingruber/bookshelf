import { useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { Book } from "@/generated/prisma/client";
import { useProgressValidation } from "@/hooks/use-progress-validation";
import { trpc } from "@/trpc/client";

const UpdateReadingProgressCard = ({
  book,
}: {
  book: Book;
}): React.ReactElement => {
  const { pageCount, progress } = book;
  const utils = trpc.useUtils();

  const [selectedProgressType, setSelectedProgressType] = useState<
    "%" | "pages"
  >("%");
  const [enteredComments, setEnteredComments] = useState<string>("");
  const { mutate: updateReadingProgress, isPending } =
    trpc.readingProgress.createReadingProgressInstance.useMutation({
      onSuccess: () => {
        utils.book.getBook.invalidate(book.id);
        utils.readingProgress.getProgressHistory.invalidate();
        utils.book.getBooks.invalidate({
          sortBy: "updatedAt",
          sortDirection: "desc",
        });
        utils.readingProgress.getAllReadingProgress.invalidate();
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
    <Card className="bg-card/40 mf:h-80 h-auto min-h-80 w-full rounded-md lg:w-3/4">
      <CardContent>
        <div className="flex h-full flex-col gap-y-2">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end sm:gap-x-4 lg:gap-x-6">
            <div className="relative flex w-full flex-col items-center gap-y-2 sm:w-1/3">
              <Label htmlFor="value">{`Progress (${selectedProgressType})`}</Label>
              <Input
                id="value"
                type="number"
                step="1"
                className={`rounded-md ${progressValidationError ? "border-red-500" : ""}`}
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
            <div className="flex w-full flex-col items-center gap-y-2 sm:w-1/3">
              <Label htmlFor="progressType">Progress Type</Label>
              <Select
                value={selectedProgressType}
                onValueChange={(value) =>
                  setSelectedProgressType(value as "%" | "pages")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="%">%</SelectItem>
                  <SelectItem value="pages">pages</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-full items-end sm:mt-6 sm:w-1/3">
              <Button
                className="w-full cursor-pointer rounded-md"
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
