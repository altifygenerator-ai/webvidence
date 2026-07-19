import { describe, expect, it } from "vitest";
import {
  buildMailtoHref,
  buildSmsHref,
  normalizePhoneForLink,
} from "../lib/outreach/links";

describe("outreach app links", () => {
  it("uses percent-encoded spaces instead of literal plus signs in email fields", () => {
    const href = buildMailtoHref(
      "owner@example.com",
      "Quick website + SEO question",
      "Afternoon, I had a quick question about your website + Google listing.",
    );

    expect(href).toBe(
      "mailto:owner@example.com?subject=Quick%20website%20%2B%20SEO%20question&body=Afternoon%2C%20I%20had%20a%20quick%20question%20about%20your%20website%20%2B%20Google%20listing.",
    );
    expect(href.split("?")[1]).not.toContain("+");
  });

  it("preserves clean email paragraphs across desktop and mobile mail clients", () => {
    const href = buildMailtoHref(
      "owner@example.com",
      "Question",
      "First paragraph.\n\nSecond paragraph.",
    );

    expect(href).toContain(
      "body=First%20paragraph.%0D%0A%0D%0ASecond%20paragraph.",
    );
  });

  it("builds clean Android and Apple text-message handoffs", () => {
    const android = buildSmsHref(
      "(501) 555-0123",
      "Afternoon, quick question for you.",
      false,
    );
    const apple = buildSmsHref(
      "+1 (501) 555-0123",
      "First line.\nSecond line.",
      true,
    );

    expect(android).toBe(
      "sms:5015550123?body=Afternoon%2C%20quick%20question%20for%20you.",
    );
    expect(apple).toBe(
      "sms:+15015550123&body=First%20line.%0ASecond%20line.",
    );
    expect(android.split("body=")[1]).not.toContain("+");
    expect(apple.split("body=")[1]).not.toContain("+");
  });

  it("rejects invalid phone values", () => {
    expect(normalizePhoneForLink("555")).toBe("");
    expect(buildSmsHref("555", "Hello", false)).toBe("");
  });
});
