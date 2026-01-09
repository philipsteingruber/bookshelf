import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ReadingProgressWithProgressSinceLast } from "@/hooks/use-reading-history";
import { formatFullTimestamp } from "@/lib/chart-utils";

interface ReadingProgressDetailModalProps {
  entry: ReadingProgressWithProgressSinceLast | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ReadingProgressDetailModal = ({
  entry,
  open,
  onOpenChange,
}: ReadingProgressDetailModalProps) => {
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
            <p className="text-sm font-medium text-muted-foreground">
              Progress
            </p>
            <p className="text-2xl font-bold text-primary">{entry.progress}%</p>
          </div>

          {/* Session progress */}
          {entry.progressSinceLast > 0 && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Progress This Session
              </p>
              <p className="text-lg font-semibold text-foreground">
                +{entry.progressSinceLast}%
              </p>
            </div>
          )}

          {/* Comments */}
          {entry.comments && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">Notes</p>
              <p className="text-sm text-foreground whitespace-pre-line">
                {entry.comments}
              </p>
            </div>
          )}

          {/* No comments state */}
          {!entry.comments && (
            <p className="text-sm text-muted-foreground italic">
              No notes for this session
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
