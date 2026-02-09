"use client";

import { useState } from "react";

import { UploadIcon } from "lucide-react";
import { toast } from "sonner";

import ImportDropzone from "@/components/settings/import-dropzone";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { useDialogState } from "@/hooks/ui";
import { handleTRPCError } from "@/lib/common";
import { parseCSVFile } from "@/lib/import";
import {
  bookCSVSchema,
  goalCSVSchema,
  progressCSVSchema,
} from "@/lib/schemas/import";
import type { CSVImportData, ImportFormat, ImportResults } from "@/lib/types";
import { trpc } from "@/trpc/client";

const ImportDataDialog = (): React.ReactElement => {
  const trpcUtils = trpc.useUtils();

  const { mutateAsync: importData, isPending: isImportingData } =
    trpc.user.importData.useMutation({
      onSuccess: () => {
        toast.success("Successfully imported data");
        setIsOpen(false);
        trpcUtils.book.getDashBoardBooks.invalidate();
        trpcUtils.user.getUserStats.invalidate();
        trpcUtils.user.getReadingGoal.invalidate();
        trpcUtils.user.getReadingGoalHistory.invalidate();
        trpcUtils.readingProgress.getRecentReadingProgress.invalidate();
      },
      onError: (error) => {
        handleTRPCError(error);
      },
    });
  const { isOpen, setIsOpen, handleOpenChange } = useDialogState({
    preventClose: isImportingData,
  });
  const [format, setFormat] = useState<ImportFormat>("json");
  const [results, setResults] = useState<ImportResults | null>(null);
  const [files, setFiles] = useState<File[]>([]);

  const handleFormatChange = (newFormat: ImportFormat): void => {
    resetFiles();
    setFormat(newFormat);
  };
  const resetFiles = (): void => setFiles([]);

  const onFileAdd = (file: File): void =>
    setFiles((prevState) => {
      if (format === "json") {
        return [file];
      } else {
        if (files.length === 3) {
          toast.error("Can import at most 3 files");
          return [...prevState];
        } else {
          return [...prevState, file];
        }
      }
    });

  const handleFileUpload = async (): Promise<void> => {
    if (format === "json") {
      const file = files[0];
      const content = await file.text();
      const json = JSON.parse(content);

      const results = await importData({ format: "json", data: { json } });

      setResults(results);
    } else {
      const csvData: CSVImportData = {};

      for (const file of Array.from(files)) {
        const content = await file.text();

        if (file.name.includes("books")) {
          const parsedRows = parseCSVFile(content);
          csvData.books = bookCSVSchema.array().parse(parsedRows);
        } else if (file.name.includes("progress")) {
          const parsedRows = parseCSVFile(content);
          csvData.progress = progressCSVSchema.array().parse(parsedRows);
        } else if (file.name.includes("goals")) {
          const parsedRows = parseCSVFile(content);
          csvData.goals = goalCSVSchema.array().parse(parsedRows);
        }
      }

      const result = await importData({ format: "csv", data: csvData });

      setResults(result);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant={"outline"} className="gap-2">
          <UploadIcon className="size-4" />
          Import Data
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Data</DialogTitle>
          <DialogDescription>
            Import your data to keep going where you left off. You can import
            your Books, Progress and/or Goals. Your data can be import from
            either JSON or CSV format.
          </DialogDescription>
        </DialogHeader>
        <Separator className="my-2" />
        {results === null && (
          <>
            <FieldSet>
              <FieldLegend>
                <span className="text-sm">Import Format</span>
              </FieldLegend>
              <RadioGroup
                defaultValue="json"
                onValueChange={(v) => handleFormatChange(v as ImportFormat)}
              >
                <div className="flex items-center gap-x-2">
                  <RadioGroupItem
                    value="json"
                    id="json"
                    className="cursor-pointer"
                  />
                  <Label htmlFor="json" className="cursor-pointer">
                    JSON
                  </Label>
                </div>
                <div className="flex items-center gap-x-2">
                  <RadioGroupItem
                    value="csv"
                    id="csv"
                    className="cursor-pointer"
                  />
                  <Label htmlFor="csv" className="cursor-pointer">
                    CSV
                  </Label>
                </div>
              </RadioGroup>
            </FieldSet>
            <Separator className="my-2" />
            <ImportDropzone
              selectedFormat={format}
              selectedFiles={files}
              disabled={isImportingData}
              onResetFiles={resetFiles}
              onSubmit={handleFileUpload}
              onFileAdd={onFileAdd}
            />
            <Separator className="my-2" />
          </>
        )}
        <DialogFooter>
          {results === null && (
            <>
              <DialogClose asChild>
                <Button variant={"outline"} disabled={isImportingData}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                disabled={
                  isImportingData ||
                  (format === "json"
                    ? files.length !== 1
                    : files.length === 0 || files.length > 3)
                }
                onClick={handleFileUpload}
              >
                {isImportingData ? <Spinner /> : "Import"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportDataDialog;
