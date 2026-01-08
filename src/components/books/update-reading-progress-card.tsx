import { useState } from "react";

import { DropdownMenuTrigger } from "@radix-ui/react-dropdown-menu";
import { toast } from "sonner";

import type { Book } from "@/generated/prisma/client";
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
import { Textarea } from "../ui/textarea";

const UpdateReadingProgressCard = ({ book }: { book: Book }) => {
  const { pageCount, progress } = book;
  const utils = trpc.useUtils();

  const [selectedProgressType, setSelectedProgressType] = useState<
    "%" | "pages"
  >("%");
  const [enteredProgress, setEnteredProgress] = useState<string>("");
  const [enteredComments, setEnteredComments] = useState<string>("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const { mutate: updateReadingProgress } =
    trpc.readingProgress.createReadingProgressInstance.useMutation({
      onSuccess: () => {
        utils.book.getBook.invalidate();
        toast.success("Successfully updated reading progress.");
      },
    });

  const handleProgressChange = (value: string) => {
    setEnteredProgress(value);

    const numValue = parseInt(value);

    if (isNaN(numValue)) {
      setValidationError("Enter a valid number");
      return;
    }

    if (selectedProgressType === "%") {
      if (numValue < 0 || numValue > 100) {
        setValidationError("Progress must be between 0 and 100");
      } else if (numValue <= book.progress) {
        setValidationError(`Progress must be greater than ${book.progress}`);
      } else {
        setValidationError(null);
      }
    } else {
      if (numValue < 0) {
        setValidationError("Progress must be a positive number");
      } else if (numValue > book.pageCount) {
        setValidationError(
          `Progress cannot be greater than pagecount (${book.pageCount})`,
        );
      } else if (Math.floor((numValue / pageCount) * 100) <= book.progress) {
        setValidationError(
          `Progress must be greater than current progress (${Math.floor((book.progress / 100) * pageCount)})`,
        );
      } else {
        setValidationError(null);
      }
    }
  };

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
                className={`rounded-[6px] ${validationError ? "border-red-500" : ""}`}
                placeholder={
                  selectedProgressType === "%"
                    ? progress.toString()
                    : Math.floor((progress / 100) * pageCount).toString()
                }
                value={enteredProgress}
                onChange={(e) => handleProgressChange(e.target.value)}
              />
              {validationError && (
                <p className="absolute -bottom-6 left-0 text-xs whitespace-nowrap text-red-400">
                  {validationError}
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
                className="w-full rounded-[6px]"
                disabled={
                  !enteredProgress ||
                  isNaN(parseInt(enteredProgress)) ||
                  (selectedProgressType === "%" &&
                    (parseInt(enteredProgress) < 0 ||
                      parseInt(enteredProgress) > 100 ||
                      parseInt(enteredProgress) <= book.progress)) ||
                  (selectedProgressType === "pages" &&
                    (parseInt(enteredProgress) < 0 ||
                      parseInt(enteredProgress) > book.pageCount ||
                      Math.floor(
                        (parseInt(enteredProgress) / book.pageCount) * 100,
                      ) <= book.progress))
                }
                onClick={() => {
                  const basePayload = {
                    bookId: book.id,
                    comments: enteredComments || undefined,
                  };

                  if (selectedProgressType === "%") {
                    updateReadingProgress({
                      ...basePayload,
                      newProgress: parseInt(enteredProgress),
                    });
                  } else {
                    updateReadingProgress({
                      ...basePayload,
                      newPagesRead: parseInt(enteredProgress),
                    });
                  }
                }}
              >
                Submit
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
