import { describe, expect, it } from "vitest";

import { getAttr, parseElements, parseHtml, parseXml } from "./script-parser";

describe("getAttr", () => {
  it("extracts a double-quoted attribute value", () => {
    expect(getAttr(`href="foo.html" id="bar"`, "href")).toBe("foo.html");
  });

  it("extracts a single-quoted attribute value", () => {
    expect(getAttr(`href='foo.html'`, "href")).toBe("foo.html");
  });

  it("is case-insensitive for the attribute name", () => {
    expect(getAttr(`HREF="foo.html"`, "href")).toBe("foo.html");
  });

  it("returns null when the attribute is absent", () => {
    expect(getAttr(`id="bar"`, "href")).toBeNull();
  });

  it("returns an empty string for an empty attribute value", () => {
    expect(getAttr(`href=""`, "href")).toBe("");
  });
});

describe("parseElements", () => {
  it("finds a single self-closing element", () => {
    const elements = parseElements(`<item href="ch1.xhtml"/>`, "item");
    expect(elements).toHaveLength(1);
    expect(elements[0]!.getAttribute("href")).toBe("ch1.xhtml");
  });

  it("finds multiple elements of the same tag", () => {
    const src = `<item href="ch1.xhtml"/><item href="ch2.xhtml"/>`;
    const elements = parseElements(src, "item");
    expect(elements).toHaveLength(2);
    expect(elements[1]!.getAttribute("href")).toBe("ch2.xhtml");
  });

  it("finds an element without a self-closing slash", () => {
    const elements = parseElements(`<itemref idref="ch1">`, "itemref");
    expect(elements).toHaveLength(1);
    expect(elements[0]!.getAttribute("idref")).toBe("ch1");
  });

  it("returns an empty array when no elements match the tag", () => {
    expect(parseElements(`<item href="ch1.xhtml"/>`, "itemref")).toHaveLength(0);
  });

  it("does not include closing tags in the results", () => {
    const elements = parseElements(`<item href="ch1.xhtml"></item>`, "item");
    expect(elements).toHaveLength(1);
  });
});

describe("parseXml", () => {
  it('returns manifest items for selector "manifest item"', () => {
    const src = `<manifest><item href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest>`;
    const doc = parseXml(src);
    const items = doc.querySelectorAll("manifest item");
    expect(items).toHaveLength(1);
    expect(items[0]!.getAttribute("href")).toBe("ch1.xhtml");
  });

  it('returns spine itemrefs for selector "spine itemref"', () => {
    const src = `<spine><itemref idref="ch1"/><itemref idref="ch2"/></spine>`;
    const doc = parseXml(src);
    const items = doc.querySelectorAll("spine itemref");
    expect(items).toHaveLength(2);
  });

  it("returns an empty array for an unrecognised selector", () => {
    const doc = parseXml("<root/>");
    expect(doc.querySelectorAll("foo bar")).toHaveLength(0);
  });
});

describe("parseHtml", () => {
  it("extracts text content from the body element", () => {
    const doc = parseHtml("<html><body><p>Hello world</p></body></html>");
    expect(doc.body?.textContent).toBe("Hello world");
  });

  it("strips HTML tags from the body content", () => {
    const doc = parseHtml("<body><b>bold</b> text</body>");
    expect(doc.body?.textContent).toBe("bold text");
  });

  it("falls back to the full input when no body tag is present", () => {
    const doc = parseHtml("no body tag here");
    expect(doc.body?.textContent).toBe("no body tag here");
  });

  it("returns an empty querySelectorAll", () => {
    const doc = parseHtml("<body>text</body>");
    expect(doc.querySelectorAll("anything")).toHaveLength(0);
  });
});
