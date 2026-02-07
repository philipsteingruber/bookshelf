import { useState } from "react";

import { DownloadIcon } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { useDialogState } from "@/hooks/ui";
import { handleTRPCError } from "@/lib/common";
import {
  downloadFile,
  exportBooksToCSV,
  exportReadingGoalsToCSV,
  exportReadingProgressToCSV,
  exportToJSON,
  generateExportFilename,
} from "@/lib/export";
import { trpc } from "@/trpc/client";

type ExportFormat =
  | "json"
  | "csv-books"
  | "csv-progress"
  | "csv-goals"
  | "csv-all";

const ExportDataDialog = (): React.ReactElement => {
  const [format, setFormat] = useState<ExportFormat>("json");
  const { mutate: exportData, isPending: isExporting } =
    trpc.user.getExportData.useMutation({
      onSuccess: (data) => {
        switch (format) {
          case "json": {
            const content = exportToJSON(data);
            const filename = generateExportFilename("bookshelf_export", "json");
            downloadFile(content, filename, "application/json");
            break;
          }
          case "csv-books": {
            const content = exportBooksToCSV(data.books);
            const filename = generateExportFilename("bookshelf_book", "csv");
            downloadFile(content, filename, "text/csv");
            break;
          }
          case "csv-progress": {
            const content = exportReadingProgressToCSV(data.readingProgress);
            const filename = generateExportFilename(
              "bookshelf_reading_progress",
              "csv",
            );
            downloadFile(content, filename, "text/csv");
            break;
          }
          case "csv-goals": {
            const content = exportReadingGoalsToCSV(data.readingGoals);
            const filename = generateExportFilename(
              "bookshelf_reading_goals",
              "csv",
            );
            downloadFile(content, filename, "text/csv");
            break;
          }
          case "csv-all": {
            const booksContent = exportBooksToCSV(data.books);
            const progressContent = exportReadingProgressToCSV(
              data.readingProgress,
            );
            const goalsContent = exportReadingGoalsToCSV(data.readingGoals);

            downloadFile(
              booksContent,
              generateExportFilename("bookshelf_books", "csv"),
              "text/csv",
            );
            downloadFile(
              progressContent,
              generateExportFilename("bookshelf_reading_progress", "csv"),
              "text/csv",
            );
            downloadFile(
              goalsContent,
              generateExportFilename("bookshelf_reading_goals", "csv"),
              "text/csv",
            );
            break;
          }
        }
        toast.success("Data exported successfully!");
        setIsOpen(false);
      },
      onError: (error) => handleTRPCError(error),
    });

  const { isOpen, setIsOpen, handleOpenChange } = useDialogState({
    preventClose: isExporting,
  });

  const handleExport = (): void => {
    exportData();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant={"outline"} className="gap-2">
          <DownloadIcon className="size-4" />
          Export Data
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Export Your Data</DialogTitle>
          <DialogDescription>
            Download your reading data as a backup or for use in other
            applications.
          </DialogDescription>
        </DialogHeader>
        <div className="gap-y-4 py-4">
          <RadioGroup
            value={format}
            onValueChange={(v) => setFormat(v as ExportFormat)}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="json" id="json" />
              <Label htmlFor="json" className="font-normal">
                <div className="w-[180px] font-medium md:w-[200px]">
                  Complete Export (JSON)
                </div>
                <div className="text-muted-foreground text-sm">
                  All data in structured format
                </div>
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="csv-books" id="csv-books" />
              <Label htmlFor="csv-books" className="font-normal">
                <div className="w-[180px] font-medium md:w-[200px]">
                  Books Only (CSV)
                </div>
                <div className="text-muted-foreground text-sm">
                  Book list without reading history
                </div>
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="csv-progress" id="csv-progress" />
              <Label htmlFor="csv-progress" className="font-normal">
                <div className="w-[180px] font-medium md:w-[200px]">
                  Reading Progress (CSV)
                </div>
                <div className="text-muted-foreground text-sm">
                  All progress entries with timestamps
                </div>
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="csv-goals" id="csv-goals" />
              <Label htmlFor="csv-goals" className="font-normal">
                <div className="w-[180px] font-medium md:w-[200px]">
                  Reading Goals (CSV)
                </div>
                <div className="text-muted-foreground text-sm">
                  Yearly reading goals
                </div>
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="csv-all" id="csv-all" />
              <Label htmlFor="csv-all" className="font-normal">
                <div className="w-[180px] font-medium md:w-[200px]">
                  All Data (Multiple CSVs)
                </div>
                <div className="text-muted-foreground text-sm">
                  Downloads 3 separate CSV files
                </div>
              </Label>
            </div>
          </RadioGroup>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant={"outline"}
            onClick={() => handleOpenChange(false)}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? <Spinner /> : "Export"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExportDataDialog;
