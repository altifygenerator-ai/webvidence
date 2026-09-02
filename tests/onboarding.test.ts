import { describe, expect, it } from "vitest";
import { getOnboardingStage, onboardingStep } from "@/lib/onboarding";

describe("quiet onboarding stage", () => {
  it("moves through the real workflow without a stored tutorial flag", () => {
    expect(getOnboardingStage({ searches: 0, reviews: 0, messages: 0, sentMessages: 0, routineSet: false })).toBe("first_search");
    expect(getOnboardingStage({ searches: 1, reviews: 0, messages: 0, sentMessages: 0, routineSet: false })).toBe("review");
    expect(getOnboardingStage({ searches: 1, reviews: 1, messages: 0, sentMessages: 0, routineSet: false })).toBe("draft");
    expect(getOnboardingStage({ searches: 1, reviews: 1, messages: 1, sentMessages: 0, routineSet: false })).toBe("send");
    expect(getOnboardingStage({ searches: 1, reviews: 1, messages: 1, sentMessages: 1, routineSet: false })).toBe("repeat");
    expect(getOnboardingStage({ searches: 1, reviews: 1, messages: 1, sentMessages: 1, routineSet: true })).toBe("active");
  });

  it("returns the matching progress position", () => {
    expect(onboardingStep("first_search")).toBe(0);
    expect(onboardingStep("review")).toBe(1);
    expect(onboardingStep("draft")).toBe(2);
    expect(onboardingStep("send")).toBe(3);
    expect(onboardingStep("repeat")).toBe(4);
    expect(onboardingStep("active")).toBe(5);
  });
});
