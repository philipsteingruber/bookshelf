import type { Book } from "@/generated/prisma/client";
import { BOOK_COVER_PLACEHOLDER_URL } from "@/lib/constants";
import { PenIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Progress } from "../ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

const ReadingProgressCard = ({ book }: { book: Book }) => {
  const coverUrl = book.coverUrl || BOOK_COVER_PLACEHOLDER_URL;
  const [readingProgressDialogOpen, setReadingProgressDialogOpen] =
    useState<boolean>(false);

  return (
    <div className="w-1/4">
      <Card className="hover:bg-card/80 w-full">
        <CardContent className="flex gap-x-2 px-2">
          <Link href={`/books/${book.id}`} className="flex flex-1 gap-x-2">
            <div className="relative aspect-2/3 w-20 shrink-0 overflow-hidden bg-gray-200">
              <Image
                src={coverUrl}
                alt={book.title}
                fill
                sizes="80px"
                style={{ objectFit: "cover" }}
                priority
                placeholder="blur"
                blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI2UwZTBlMCIvPjwvc3ZnPg=="
              />
            </div>
            <div className="flex w-full flex-col justify-center gap-y-4 px-2">
              <div className="flex flex-col gap-y-1">
                <span className="font-semibold">{book.title}</span>
                <span className="font-serif">{book.author}</span>
              </div>
              <div className="flex w-full items-center gap-x-2">
                <span className="text-sm">{book.progress}%</span>
                <Progress value={book.progress} className="w-full" />
              </div>
            </div>
          </Link>
          <div className="flex items-end pb-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Dialog
                  open={readingProgressDialogOpen}
                  onOpenChange={setReadingProgressDialogOpen}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant={"ghost"}
                      className="hover:border-primary hover:ring-primary cursor-pointer border-none hover:border-2 hover:ring-2"
                    >
                      <PenIcon />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="flex flex-col items-center">
                    <DialogTitle className="flex items-center gap-x-1">
                      Update reading progress for{" "}
                      <span className="italic">{book.title}</span>
                    </DialogTitle>
                  </DialogContent>
                </Dialog>
              </TooltipTrigger>
              <TooltipContent>
                <p>Update reading progress</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReadingProgressCard;
