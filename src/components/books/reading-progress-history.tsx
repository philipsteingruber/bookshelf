import type { ReadingProgress } from "@/generated/prisma/client";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

const ReadingProgressHistory = ({
  readingProgressHistory,
}: {
  readingProgressHistory: ReadingProgress[];
}) => {
  return (
    <Card className="w-1/4">
      <CardContent className="flex flex-col gap-y-2">
        {readingProgressHistory.map((readingProgress) => (
          <Card key={readingProgress.id}>
            <CardHeader>
              <CardTitle>
                {readingProgress.updatedAt.toLocaleDateString("sv-SE")}
              </CardTitle>
            </CardHeader>
            <CardContent>{readingProgress.progress}</CardContent>
          </Card>
        ))}
      </CardContent>
    </Card>
  );
};

export default ReadingProgressHistory;
