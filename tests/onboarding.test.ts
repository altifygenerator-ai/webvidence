import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getOnboardingStage, onboardingStep } from "@/lib/onboarding";

describe("retention onboarding stage", () => {
  it("moves through Find → Review → Draft → Send → Repeat", () => {
    expect(getOnboardingStage({ searches: 0, reviews: 0, messages: 0, sentMessages: 0, repeatEstablished: false })).toBe("first_search");
    expect(getOnboardingStage({ searches: 1, reviews: 0, messages: 0, sentMessages: 0, repeatEstablished: false })).toBe("review");
    expect(getOnboardingStage({ searches: 1, reviews: 1, messages: 0, sentMessages: 0, repeatEstablished: false })).toBe("draft");
    expect(getOnboardingStage({ searches: 1, reviews: 1, messages: 1, sentMessages: 0, repeatEstablished: false })).toBe("send");
    expect(getOnboardingStage({ searches: 1, reviews: 1, messages: 1, sentMessages: 1, repeatEstablished: false })).toBe("repeat");
    expect(getOnboardingStage({ searches: 1, reviews: 1, messages: 1, sentMessages: 1, repeatEstablished: true })).toBe("active");
  });

  it("does not count an automatically completed audit as a user review", () => {
    expect(getOnboardingStage({ searches: 1, reviews: 0, messages: 0, sentMessages: 0, repeatEstablished: false })).toBe("review");
  });


  it("records a real direct lead view client-side instead of treating server prefetch as review", () => {
    const tracker = readFileSync(join(process.cwd(), "components/lead-review-tracker.tsx"), "utf8");
    const route = readFileSync(join(process.cwd(), "app/api/leads/[id]/route.ts"), "utf8");
    expect(tracker).toContain("JSON.stringify({ reviewed: true })");
    expect(route).toContain("if (input.reviewed)");
    expect(route).toContain("operation: 'lead_work_started'");
  });

  it("returns all five workflow positions plus active", () => {
    expect(onboardingStep("first_search")).toBe(0);
    expect(onboardingStep("review")).toBe(1);
    expect(onboardingStep("draft")).toBe(2);
    expect(onboardingStep("send")).toBe(3);
    expect(onboardingStep("repeat")).toBe(4);
    expect(onboardingStep("active")).toBe(5);
  });
});
