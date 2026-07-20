import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import RentalOperationalMetadataCard from "@/features/rental/components/RentalOperationalMetadataCard";

describe("Rental operational metadata display", () => {
  it("renders historical snapshot values without internal IDs", async () => {
    const container = document.createElement("div"); const root = createRoot(container);
    await act(async () => root.render(createElement(RentalOperationalMetadataCard, { metadata: {
      costCode: { id: "internal-cost", code: "5031HEAVYEQPT", name: "Heavy Equipment" },
      activityCode: { id: "internal-activity", code: "LDC", name: "LAUCHANCO DEVELOPMENT CORPORATION" },
    } })));
    expect(container.textContent).toContain("Operational Metadata at Rental Creation");
    expect(container.textContent).toContain("5031HEAVYEQPT");
    expect(container.textContent).toContain("Heavy Equipment");
    expect(container.textContent).toContain("LDC");
    expect(container.textContent).not.toContain("internal-cost");
    await act(async () => root.unmount());
  });

  it("distinguishes legacy and newly missing captures", async () => {
    for (const [metadata, messages] of [
      [undefined, ["Operational metadata not captured for this legacy Rental"]],
      [{}, ["Cost Code not captured", "Activity Code not captured"]],
    ] as const) {
      const container = document.createElement("div"); const root = createRoot(container);
      await act(async () => root.render(createElement(RentalOperationalMetadataCard, { metadata })));
      for (const message of messages) expect(container.textContent).toContain(message);
      await act(async () => root.unmount());
    }
  });
});
