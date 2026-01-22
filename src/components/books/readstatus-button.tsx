import type { Book } from "@/generated/prisma/client";
import { getStatusButtonStyle, parseReadStatus } from "@/lib/book-utils";
import { cn } from "@/lib/utils";

import { Button } from "../ui/button";

const ReadStatusButton = ({
  book,
  className,
}: {
  book: Book;
  className?: string;
}): React.ReactElement => {
  const buttonText = parseReadStatus(book.status);
  const buttonStyle = getStatusButtonStyle(book.status);

  return (
    <Button
      className={cn(
        buttonStyle,
        "h-8 w-24 cursor-pointer rounded-sm",
        className,
      )}
    >
      {buttonText}
    </Button>
  );
};

export default ReadStatusButton;
