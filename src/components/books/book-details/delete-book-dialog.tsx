"use client";

import { useRouter } from "next/navigation";

import { TrashIcon } from "lucide-react";
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
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Book } from "@/generated/prisma/client";
import { useDialogState } from "@/hooks/ui";
import { handleTRPCError } from "@/lib/error-handler";
import { trpc } from "@/trpc/client";

interface DeleteBookDialogProps {
  book: Book;
}

const DeleteBookDialog = ({
  book,
}: DeleteBookDialogProps): React.ReactElement => {
  const router = useRouter();

  const { mutate: deleteBook, isPending: isDeleting } =
    trpc.book.deleteBook.useMutation({
      onSuccess: () => {
        toast.success(`Deleted ${book.title} from BookShelf`, {
          duration: 5000,
        });
        router.replace("/dashboard");
      },
      onError: (error) => {
        handleTRPCError(error);
      },
    });

  const {
    isOpen: isDeleteDialogOpen,
    handleOpenChange: handleOpenDeleteDialogChange,
    setIsOpen: setIsDeleteDialogOpen,
  } = useDialogState({
    preventClose: isDeleting,
  });

  return (
    <Dialog
      open={isDeleteDialogOpen}
      onOpenChange={handleOpenDeleteDialogChange}
    >
      <Tooltip>
        <DialogTrigger asChild>
          <TooltipTrigger asChild>
            <Button className="bg-destructive/90 text-foreground hover:bg-destructive/70 hover:text-muted-foreground transition-colors">
              <TrashIcon />
            </Button>
          </TooltipTrigger>
        </DialogTrigger>
        <TooltipContent>
          <p>{`Delete '${book.title}' from BookShelf`}</p>
        </TooltipContent>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Delete '${book.title}'?`}</DialogTitle>
          <DialogDescription>{`This will permanently delete '${book.title}' and all its reading progress from your BookShelf. This cannot be undone.`}</DialogDescription>
        </DialogHeader>
        <div className="flex w-full flex-col gap-y-4 lg:flex-row lg:gap-x-4">
          <Button
            onClick={() => setIsDeleteDialogOpen(false)}
            variant={"outline"}
            disabled={isDeleting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={() => deleteBook(book.id)}
            variant={"destructive"}
            disabled={isDeleting}
            className="flex-1"
          >
            {isDeleting ? <Spinner /> : "Confirm"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteBookDialog;
