export type OperationalRefreshScope =
  | "review-request" | "deur" | "revision-history" | "billing-eligibility"
  | "rental-line" | "equipment" | "assignment" | "rental"
  | "closure-readiness" | "audit";

const plans = {
  createReview: ["review-request", "deur", "rental-line"],
  decideReview: ["review-request", "deur", "billing-eligibility", "rental-line"],
  correction: ["deur", "revision-history", "review-request", "rental-line"],
  meter: ["deur", "closure-readiness", "rental-line"],
  returnLine: ["rental-line", "equipment", "assignment", "rental", "closure-readiness"],
  returnAll: ["rental-line", "equipment", "assignment", "rental", "closure-readiness"],
  close: ["rental", "rental-line", "closure-readiness", "audit"],
} as const satisfies Record<string, readonly OperationalRefreshScope[]>;

export type OperationalCommandKind = keyof typeof plans;

export function getOperationalRefreshPlan(kind: OperationalCommandKind): readonly OperationalRefreshScope[] {
  return plans[kind];
}
