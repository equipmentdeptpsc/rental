import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import DeurOperationalMetadataCard from "@/features/rental/deur/components/DeurOperationalMetadataCard";

describe("DEUR operational metadata display", () => {
  it("renders readable snapshot values and remarks without internal IDs", async () => {
    const container = document.createElement("div"); const root = createRoot(container);
    await act(async () => root.render(createElement(DeurOperationalMetadataCard, { metadata: {
      costCode: { id: "internal-cost", code: "5031HEAVYEQPT", name: "Heavy Equipment" },
      activityCode: { id: "internal-activity", code: "LDC", name: "LAUCHANCO DEVELOPMENT CORPORATION" },
      workDescription: { id: "internal-work", code: "OTHER_OPERATION", name: "OTHER OPERATION", requiresRemarks: true },
    }, remarks: "Slope clearing" })));
    expect(container.textContent).toContain("Operational Metadata at DEUR Creation");
    expect(container.textContent).toContain("5031HEAVYEQPT");
    expect(container.textContent).toContain("LDC");
    expect(container.textContent).toContain("OTHER OPERATION");
    expect(container.textContent).toContain("Slope clearing");
    expect(container.textContent).not.toContain("internal-");
    await act(async () => root.unmount());
  });

  it("renders the legacy warning and required remarks warning", async () => {
    for (const props of [
      { metadata: undefined },
      { metadata: { workDescription: { name: "OTHER OPERATION", requiresRemarks: true } } },
    ]) {
      const container = document.createElement("div"); const root = createRoot(container);
      await act(async () => root.render(createElement(DeurOperationalMetadataCard, props)));
      expect(container.textContent).toContain(props.metadata ? "Remarks required" : "Operational metadata not captured for this legacy DEUR");
      await act(async () => root.unmount());
    }
  });

  it("renders Manual provenance and separate non-billable totals",async()=>{const container=document.createElement("div"),root=createRoot(container);await act(async()=>root.render(createElement(DeurOperationalMetadataCard,{metadata:{},creationSource:"RENTAL_COMPANY_MANUAL",manualMetadata:{reason:"SITE_COMPUTER_NOT_AVAILABLE",encodedByName:"Maria Santos",encodedAt:"2026-07-20T09:15:00.000Z",physicalDeurReference:"PAPER-001",operatorConfirmed:true},totals:{shiftMinutes:540,operationMinutes:300,idleMinutes:60,mealBreakMinutes:60,breakdownMinutes:120}})));expect(container.textContent).toContain("MANUALLY ENCODED BY RENTAL COMPANY ADMIN");expect(container.textContent).toContain("PAPER-001");expect(container.textContent).toContain("Maria Santos");expect(container.textContent).toContain("Meal Break (non-billable)");expect(container.textContent).toContain("Breakdown (non-billable)");await act(async()=>root.unmount())});

  it("renders Digital and unknown creation-source banners",async()=>{for(const [creationSource,message] of [["OPERATOR_DIGITAL","DIGITAL DEUR"],[undefined,"Creation source not captured"]] as const){const container=document.createElement("div"),root=createRoot(container);await act(async()=>root.render(createElement(DeurOperationalMetadataCard,{metadata:{},creationSource})));expect(container.textContent).toContain(message);await act(async()=>root.unmount())}});
});
