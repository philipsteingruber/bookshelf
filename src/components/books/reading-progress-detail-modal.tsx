import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatFullTimestamp } from "@/lib/reading";
import type { ReadingProgressWithProgressSinceLast } from "@/lib/types";

interface ReadingProgressDetailModalProps {
  entry: ReadingProgressWithProgressSinceLast | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ReadingProgressDetailModal = ({
  entry,
  open,
  onOpenChange,
}: ReadingProgressDetailModalProps): React.ReactElement | null => {
  if (!entry) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reading Progress Detail</DialogTitle>
          <DialogDescription>
            {formatFullTimestamp(entry.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Progress info */}
          <div>
            <p className="text-muted-foreground text-sm font-medium">
              Progress
            </p>
            <p className="text-primary text-2xl font-bold">{entry.progress}%</p>
          </div>

          {/* Session progress */}
          {entry.progressSinceLast > 0 && (
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                Progress This Session
              </p>
              <p className="text-foreground text-lg font-semibold">
                +{entry.progressSinceLast}%
              </p>
            </div>
          )}

          {/* Comments */}
          {entry.comments && (
            <div>
              <p className="text-muted-foreground text-sm font-medium">Notes</p>
              <p className="text-foreground text-sm whitespace-pre-line">
                {entry.comments}
              </p>
            </div>
          )}

          {/* No comments state */}
          {!entry.comments && (
            <p className="text-muted-foreground text-sm italic">
              No notes for this session
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
