export const parseCSV = (csvContent: string): string[][] => {
  if (!csvContent || csvContent.trim() === "") {
    return [];
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let insideQuotes = false;
  let i = 0;

  while (i < csvContent.length) {
    const char = csvContent[i];
    const nextChar = csvContent[i + 1];

    if (char === '"') {
      if (!insideQuotes) {
        insideQuotes = true;
      } else if (nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        insideQuotes = false;
      }
    } else if (char === "," && !insideQuotes) {
      currentRow.push(currentField);
      currentField = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i++;
      }

      currentRow.push(currentField);

      if (currentRow.length > 0 && currentRow.some((field) => field !== "")) {
        rows.push(currentRow);
      }

      currentRow = [];
      currentField = "";
    } else {
      currentField += char;
    }

    i++;
  }

  // Handle last field and row if CSV doesn't end with newline
  if (currentField !== "" || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((field) => field !== "")) {
      rows.push(currentRow);
    }
  }

  return rows;
};

export const csvToObjects = <T extends Record<string, string>>(
  rows: string[][],
): T[] => {
  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);

  return dataRows.map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] ?? "";
    });
    return obj as T;
  });
};

export const parseCSVFile = <T extends Record<string, string>>(
  csvContent: string,
): T[] => {
  const rows = parseCSV(csvContent);
  return csvToObjects<T>(rows);
};
