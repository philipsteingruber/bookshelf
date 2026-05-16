import JSZip from "jszip";

const getSpineFilePaths = async (zip: JSZip): Promise<string[]> => {
  const opfEntry = Object.values(zip.files).find(
    (f) => !f.dir && f.name.endsWith(".opf"),
  );
  if (!opfEntry) throw new Error("No .opf file found in KEPUB");

  const opfText = await opfEntry.async("text");
  const doc = new DOMParser().parseFromString(opfText, "application/xml");

  const manifestItems = new Map<string, string>();
  doc.querySelectorAll("manifest item").forEach((item) => {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id && href) manifestItems.set(id, href);
  });

  const spineIds = Array.from(doc.querySelectorAll("spine itemref")).map(
    (ref) => ref.getAttribute("idref") ?? "",
  );

  const opfDir = opfEntry.name.includes("/")
    ? opfEntry.name.substring(0, opfEntry.name.lastIndexOf("/") + 1)
    : "";

  return spineIds
    .map((id) => manifestItems.get(id))
    .filter((href): href is string => !!href)
    .map((href) => opfDir + href);
};

// Equivalent to Python's _get_body_text: extract text nodes from <body> only.
// Matches BeautifulSoup's body_tag.strings behaviour used in the calibre plugin.
const getBodyText = (html: string): string => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body?.textContent ?? "";
};

const countPagesAccurate = (rawHtml: string, htmlParts: string[]): number => {
  // Python computes num_divs/num_paras on the original (non-lowercased) html.
  // len(epub_html.split('<div')) == occurrences + 1, so the comparison is identical
  // to (occurrences_p > occurrences_d), which is what we compute here.
  const numDivs = rawHtml.split("<div").length - 1;
  const numParas = rawHtml.split("<p").length - 1;
  const splitChar = numParas > numDivs ? "p" : "d";

  const lower = rawHtml.toLowerCase();

  let inTag = false;
  let inP = false;
  let checkP = false;
  let closing = false;
  let pCharCount = 0;
  let lines = 0;

  for (const c of lower) {
    if (checkP) {
      if (c === "/") {
        closing = true;
        continue;
      } else if (c === splitChar) {
        if (closing) {
          inP = false;
        } else {
          inP = true;
          lines++;
        }
      }
      checkP = false;
      closing = false;
      continue;
    }

    if (c === "<") {
      inTag = true;
      checkP = true;
      continue;
    } else if (c === ">") {
      inTag = false;
      checkP = false;
      continue;
    }

    if (inP && !inTag) {
      pCharCount++;
      if (pCharCount === 70) {
        lines++;
        pCharCount = 0;
      }
    }
  }

  const accurateCount = Math.floor(lines / 31);

  // Python computes the initial fast_count on the raw HTML (tags included).
  // Only if that exceeds accurateCount does it strip to body text and recompute.
  // This matches the original two-step backstop exactly.
  const rawFastCount = Math.floor(rawHtml.length / 2400) + 1;
  if (rawFastCount <= accurateCount) {
    return accurateCount;
  }

  const bodyText = htmlParts.map(getBodyText).join(" ");
  const fastCount = Math.floor(bodyText.length / 2400) + 1;

  return Math.max(accurateCount, fastCount);
};

export const estimateKepubPageCount = async (file: File): Promise<number> => {
  const zip = await JSZip.loadAsync(file);
  const spinePaths = await getSpineFilePaths(zip);

  const htmlParts = await Promise.all(
    spinePaths.map(async (path) => {
      const entry = zip.file(path);
      if (!entry) return "";
      return entry.async("text");
    }),
  );

  const rawHtml = htmlParts.join(" ");
  return countPagesAccurate(rawHtml, htmlParts);
};
