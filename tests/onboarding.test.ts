import { describe, expect, it } from "vitest";
import { getOnboardingStage, onboardingStep } from "@/lib/onboarding";

describe("quiet onboarding stage", () => {
  it("moves through the real workflow without a stored tutorial flag", () => {
    expect(getOnboardingStage({ searches: 0, audits: 0, messages: 0, sentMessages: 0 })).toBe("first_search");
    expect(getOnboardingStage({ searches: 1, audits: 0, messages: 0, sentMessages: 0 })).toBe("review");
    expect(getOnboardingStage({ searches: 1, audits: 1, messages: 0, sentMessages: 0 })).toBe("draft");
    expect(getOnboardingStage({ searches: 1, audits: 1, messages: 1, sentMessages: 0 })).toBe("send");
    expect(getOnboardingStage({ searches: 1, audits: 1, messages: 1, sentMessages: 1 })).toBe("active");
  });

  it("returns the matching progress position", () => {
    expect(onboardingStep("first_search")).toBe(0);
    expect(onboardingStep("review")).toBe(1);
    expect(onboardingStep("draft")).toBe(2);
    expect(onboardingStep("send")).toBe(3);
    expect(onboardingStep("active")).toBe(4);
  });
});
