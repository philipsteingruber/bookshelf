// Minimal DOMParser shim for use in Node.js scripts.
// Implements only the subset used by estimateKepubPageCount:
//   - parseFromString(src, "application/xml") → supports querySelectorAll("manifest item")
//     and querySelectorAll("spine itemref"), with getAttribute on each element
//   - parseFromString(src, "text/html") → supports doc.body.textContent

interface MinimalElement {
  getAttribute(name: string): string | null;
}

interface MinimalDocument {
  querySelectorAll(selector: string): MinimalElement[];
  body?: { textContent: string };
}

export function getAttr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"));
  return m ? m[1] : null;
}

export function parseElements(src: string, tagName: string): MinimalElement[] {
  const elements: MinimalElement[] = [];
  const re = new RegExp(`<${tagName}\\b([^>]*?)\\s*/?>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const attrs = m[1];
    elements.push({ getAttribute: (name) => getAttr(attrs, name) });
  }
  return elements;
}

export function parseXml(src: string): MinimalDocument {
  return {
    querySelectorAll(selector: string): MinimalElement[] {
      if (selector === "manifest item") return parseElements(src, "item");
      if (selector === "spine itemref") return parseElements(src, "itemref");
      return [];
    },
  };
}

export function parseHtml(src: string): MinimalDocument {
  const bodyMatch = src.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyHtml = bodyMatch ? bodyMatch[1] : src;
  const textContent = bodyHtml.replace(/<[^>]+>/g, "");
  return {
    querySelectorAll: () => [],
    body: { textContent },
  };
}

export function makeScriptParser(): DOMParser {
  return {
    parseFromString(src: string, type: string): Document {
      const doc = type === "application/xml" ? parseXml(src) : parseHtml(src);
      return doc as unknown as Document;
    },
  } as DOMParser;
}
