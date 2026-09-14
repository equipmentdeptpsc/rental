import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ dependencies: { repositories: { equipmentAvailability: { checkEquipmentAvailability: async (input: { equipmentId: string }) => ({ success: true as const, value: { equipmentId: input.equipmentId, available: true, conflictCount: 0, conflicts: [] } }) } } } }));

vi.mock("@/components/form/useFormSubmission", () => ({
  useFormSubmission: (_entity: string, onSubmit: (data: unknown) => void) => ({
    busy: false,
    feedback: null,
    fail: vi.fn(),
    submit: (data: unknown) => onSubmit(data),
  }),
}));
vi.mock("@/app/composition", () => ({ useApplicationDependenciesCompatibility: () => state.dependencies }));
vi.mock("@/components/ui/Input", () => ({ default: ({ label, ...props }: { label: string } & Record<string, unknown>) => createElement("label", {}, label, createElement("input", props)) }));
vi.mock("@/components/ui/Select", () => ({ default: ({ label, options = [], ...props }: { label: string; options?: Array<{ value: string; label: string }> } & Record<string, unknown>) => createElement("label", {}, label, createElement("select", props, options.map((option) => createElement("option", { key: option.value, value: option.value }, option.label))) ) }));
vi.mock("@/components/ui/Button", () => ({ default: ({ children, ...props }: { children?: unknown } & Record<string, unknown>) => createElement("button", props, String(children ?? "")) }));
vi.mock("@/features/rental/components/RentalOperationalMetadataCard", () => ({ default: () => null }));
vi.mock("@/features/equipment/context/EquipmentContext", () => ({ useEquipment: () => ({ equipment: [] }) }));
vi.mock("@/features/customer/context/CustomerContext", () => ({ useCustomer: () => ({ customers: [] }) }));
vi.mock("@/features/project/context/ProjectContext", () => ({ useProject: () => ({ projects: [] }) }));
vi.mock("@/features/operators/context/OperatorContext", () => ({ useOperator: () => ({ operators: [] }) }));
vi.mock("@/features/assignment/context/AssignmentContext", () => ({ useAssignment: () => ({ assignments: [] }) }));
vi.mock("@/features/masters/cost-code/context/useCostCodes", () => ({ useCostCodes: () => ({ costCodes: [] }) }));
vi.mock("@/features/masters/activity-code", () => ({ useActivityCodes: () => ({ records: [] }) }));
vi.mock("@/features/rental/services/selectableRentalEquipment", () => ({ selectableRentalEquipment: () => [] }));
vi.mock("@/features/rental/utils/rentalFormOptions", () => ({ getRentalEquipmentLabel: () => "", getRentalProjectOptions: () => [] }));
vi.mock("@/features/rental/utils/rentalDateValidation", () => ({ localCalendarDate: () => "2026-09-08", validateNewRentalDates: () => undefined }));
vi.mock("@/features/rental/deur/shift-window/repository", () => ({ deurShiftWindowRepository: { getAll: () => [] } }));
vi.mock("@/features/rental/services/createRentalOperationalMetadataSnapshot", () => ({ createRentalOperationalMetadataSnapshot: () => undefined }));

import RentalForm from "@/features/rental/components/RentalForm";

const customer = { id: "customer-1", customerCode: "CUS-1", companyName: "UAT Customer", email: "", contactPerson: "", active: true };

function setInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("RentalForm user-entered values", () => {
  let root: Root | undefined;
  afterEach(() => root?.unmount());

  it("retains edited contact and date fields across customer-data refresh and submits them", async () => {
    const submitted: unknown[] = [];
    const container = document.createElement("div");
    root = createRoot(container);
    const props = { onSubmit: (data: unknown): void => { submitted.push(data); }, initialCustomerId: customer.id, initialProjectId: "project-1", canonicalData: { equipment: [{ id: "equipment-1", active: true, deleted: false }] as never, customers: [customer], projects: [{ id: "project-1", customerId: customer.id, projectCode: "P-1", projectName: "Project", status: "Active" }] as never, operators: [{ id: "operator-1", name: "Operator", status: "Active" }] as never, assignments: [{ id: "assignment-1", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1", status: "Active" }] as never, costCodes: [], activityCodes: [] } };
    await act(async () => root?.render(createElement(RentalForm, props)));
    const representative = container.querySelector('input[type="text"]') as HTMLInputElement;
    const email = container.querySelector('input[type="email"]') as HTMLInputElement;
    const dates = [...container.querySelectorAll('input[type="date"]')] as HTMLInputElement[];
    await act(async () => {
      setInputValue(representative, "Synthetic UAT Representative");
      setInputValue(email, "uat.d3e@example.test");
      setInputValue(dates[0], "2031-04-11");
      setInputValue(dates[1], "2031-04-13");
    });
    expect(representative.value).toBe("Synthetic UAT Representative");
    expect(email.value).toBe("uat.d3e@example.test");
    expect(dates[0].value).toBe("2031-04-11");
    expect(dates[1].value).toBe("2031-04-13");

    await act(async () => root?.render(createElement(RentalForm, { ...props, canonicalData: { ...props.canonicalData, customers: [{ ...customer }] } })));
    const refreshedRepresentative = container.querySelector('input[type="text"]') as HTMLInputElement;
    const refreshedEmail = [...container.querySelectorAll("input")].find((input) => input.type === "email") as HTMLInputElement;
    const refreshedDates = [...container.querySelectorAll('input[type="date"]')] as HTMLInputElement[];
    expect(refreshedRepresentative.value).toBe("Synthetic UAT Representative");
    expect(refreshedEmail.value).toBe("uat.d3e@example.test");
    expect(refreshedDates[0].value).toBe("2031-04-11");
    expect(refreshedDates[1].value).toBe("2031-04-13");
    await act(async () => { (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click(); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(submitted).toHaveLength(1);
    expect((submitted[0] as { customerRepresentativeName?: string }).customerRepresentativeName).toBe("Synthetic UAT Representative");
    expect((submitted[0] as { customerReviewEmail?: string }).customerReviewEmail).toBe("uat.d3e@example.test");
    expect((submitted[0] as { dateOut?: string }).dateOut).toBe("2031-04-11");
    expect((submitted[0] as { expectedReturn?: string }).expectedReturn).toBe("2031-04-13");
  });

  it("retains edited contact and date fields when Rental Type changes", async () => {
    const container = document.createElement("div");
    root = createRoot(container);
    const props = { onSubmit: (): void => undefined, initialCustomerId: customer.id, initialProjectId: "project-1", canonicalData: { equipment: [{ id: "equipment-1", active: true, deleted: false }] as never, customers: [customer], projects: [{ id: "project-1", customerId: customer.id, projectCode: "P-1", projectName: "Project", status: "Active" }] as never, operators: [{ id: "operator-1", name: "Operator", status: "Active" }] as never, assignments: [{ id: "assignment-1", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1", status: "Active" }] as never, costCodes: [], activityCodes: [] } };
    await act(async () => root?.render(createElement(RentalForm, props)));
    const representative = container.querySelector('input[type="text"]') as HTMLInputElement;
    const email = container.querySelector('input[type="email"]') as HTMLInputElement;
    const dates = [...container.querySelectorAll('input[type="date"]')] as HTMLInputElement[];
    const rentalType = [...container.querySelectorAll("select")].find((select) => [...select.options].some((option) => option.value === "Bare Rental")) as HTMLSelectElement;
    await act(async () => {
      setInputValue(representative, "Synthetic UAT Representative");
      setInputValue(email, "uat.d3e@example.test");
      setInputValue(dates[0], "2031-04-11");
      setInputValue(dates[1], "2031-04-13");
    });
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(rentalType, "Bare Rental");
      rentalType.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const refreshedDates = [...container.querySelectorAll('input[type="date"]')] as HTMLInputElement[];
    expect((container.querySelector('input[type="text"]') as HTMLInputElement).value).toBe("Synthetic UAT Representative");
    expect((container.querySelector('input[type="email"]') as HTMLInputElement).value).toBe("uat.d3e@example.test");
    expect(refreshedDates[0].value).toBe("2031-04-11");
    expect(refreshedDates[1].value).toBe("2031-04-13");
  });

  it("restores edited date fields after the form remounts with its parent draft", async () => {
    const container = document.createElement("div");
    root = createRoot(container);
    let dateDraft = { dateOut: "", expectedReturn: "" };
    let remount = 0;
    const renderHarness = async () => {
      await act(async () => root?.render(createElement(RentalForm, {
        key: remount,
        onSubmit: (): void => undefined,
        initialCustomerId: customer.id,
        initialProjectId: "project-1",
        initialDateOut: dateDraft.dateOut || undefined,
        initialExpectedReturn: dateDraft.expectedReturn || undefined,
        onDateOutChange: (value: string) => { dateDraft = { ...dateDraft, dateOut: value }; },
        onExpectedReturnChange: (value: string) => { dateDraft = { ...dateDraft, expectedReturn: value }; },
        canonicalData: { equipment: [{ id: "equipment-1", active: true, deleted: false }] as never, customers: [customer], projects: [{ id: "project-1", customerId: customer.id, projectCode: "P-1", projectName: "Project", status: "Active" }] as never, operators: [{ id: "operator-1", name: "Operator", status: "Active" }] as never, assignments: [{ id: "assignment-1", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1", status: "Active" }] as never, costCodes: [], activityCodes: [] },
      })));
    };
    await renderHarness();
    const dates = [...container.querySelectorAll('input[type="date"]')] as HTMLInputElement[];
    await act(async () => {
      setInputValue(dates[0], "2031-04-11");
      setInputValue(dates[1], "2031-04-13");
    });
    remount += 1;
    await renderHarness();
    const remountedDates = [...container.querySelectorAll('input[type="date"]')] as HTMLInputElement[];
    expect(remountedDates[0].value).toBe("2031-04-11");
    expect(remountedDates[1].value).toBe("2031-04-13");
  });

  it("keeps intended customer and assignment defaults on initial load", async () => {
    const seededCustomer = { ...customer, contactPerson: "Synthetic Customer Contact", email: "synthetic.customer@example.test" };
    const container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root?.render(createElement(RentalForm, {
      onSubmit: (): void => undefined,
      initialCustomerId: seededCustomer.id,
      initialProjectId: "project-1",
      initialEquipmentId: "equipment-1",
      initialOperatorId: "operator-1",
      initialAssignmentIds: ["assignment-1"],
      canonicalData: {
        equipment: [{ id: "equipment-1", active: true, deleted: false }] as never,
        customers: [seededCustomer],
        projects: [{ id: "project-1", customerId: seededCustomer.id, projectCode: "P-1", projectName: "Project", status: "Active" }] as never,
        operators: [{ id: "operator-1", name: "Operator", status: "Active" }] as never,
        assignments: [{ id: "assignment-1", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1", status: "Active" }] as never,
        costCodes: [], activityCodes: [],
      },
    })));
    expect((container.querySelector('input[type="text"]') as HTMLInputElement).value).toBe("Synthetic Customer Contact");
    expect((container.querySelector('input[type="email"]') as HTMLInputElement).value).toBe("synthetic.customer@example.test");
    expect((container.querySelectorAll('input[type="date"]')[0] as HTMLInputElement).value).toBe("2026-09-08");
    expect((container.querySelectorAll('input[type="date"]')[1] as HTMLInputElement).value).toBe("");
    expect((container.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
  });

  it("reapplies contact defaults when the user selects a different customer", async () => {
    const otherCustomer = { ...customer, id: "customer-2", customerCode: "CUS-2", contactPerson: "Other Synthetic Contact", email: "other.synthetic@example.test" };
    const container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root?.render(createElement(RentalForm, {
      onSubmit: (): void => undefined,
      initialCustomerId: customer.id,
      canonicalData: {
        equipment: [{ id: "equipment-1", active: true, deleted: false }] as never,
        customers: [customer, otherCustomer],
        projects: [], operators: [], assignments: [], costCodes: [], activityCodes: [],
      },
    })));
    const customerSelect = container.querySelector("select") as HTMLSelectElement;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(customerSelect, otherCustomer.id);
    await act(async () => customerSelect.dispatchEvent(new Event("change", { bubbles: true })));
    expect((container.querySelector('input[type="text"]') as HTMLInputElement).value).toBe("Other Synthetic Contact");
    expect((container.querySelector('input[type="email"]') as HTMLInputElement).value).toBe("other.synthetic@example.test");
  });
  it("keeps an active canonical Assignment selectable when its Equipment has no legacy status label", async () => {
    const container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root?.render(createElement(RentalForm, {
      onSubmit: (): void => undefined,
      initialCustomerId: customer.id,
      initialProjectId: "project-1",
      canonicalData: {
        equipment: [{ id: "equipment-1", active: true, deleted: false, status: undefined }] as never,
        customers: [customer],
        projects: [{ id: "project-1", customerId: customer.id, projectCode: "P-1", projectName: "Project", status: "Active" }] as never,
        operators: [{ id: "operator-1", name: "Operator", status: "Active" }] as never,
        assignments: [{ id: "assignment-1", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1", status: "Active" }] as never,
        costCodes: [], activityCodes: [],
      },
    })));
    const assignment = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(assignment.disabled).toBe(false);
  });

  it("hides direct Equipment selection and rejects canonical Rental submit without an Assignment", async () => {
    const submitted: unknown[] = [];
    const container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root?.render(createElement(RentalForm, { onSubmit: (data: unknown): void => { submitted.push(data); }, canonicalData: { equipment: [{ id: "equipment-1", active: true, deleted: false }] as never, customers: [customer], projects: [{ id: "project-1", customerId: customer.id, projectCode: "P-1", projectName: "Project", status: "Active" }] as never, operators: [], assignments: [], costCodes: [], activityCodes: [] }, initialCustomerId: customer.id, initialProjectId: "project-1" })));
    expect([...container.querySelectorAll("label")].some((label) => label.textContent?.trim() === "Equipment")).toBe(false);
    await act(async () => container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(submitted).toHaveLength(0);
  });

  it("submits canonical Rental data only with Assignment-backed lines", async () => {
    const submitted: unknown[] = [];
    const container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root?.render(createElement(RentalForm, { onSubmit: (data: unknown): void => { submitted.push(data); }, canonicalData: { equipment: [{ id: "equipment-1", active: true, deleted: false }] as never, customers: [customer], projects: [{ id: "project-1", customerId: customer.id, projectCode: "P-1", projectName: "Project", status: "Active" }] as never, operators: [{ id: "operator-1", name: "Operator", status: "Active" }] as never, assignments: [{ id: "assignment-1", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1", status: "Active" }] as never, costCodes: [], activityCodes: [] }, initialCustomerId: customer.id, initialProjectId: "project-1" })));
    const assignment = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => { assignment.click(); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(submitted).toHaveLength(1);
    expect((submitted[0] as { assignmentIds: string[] }).assignmentIds).toEqual(["assignment-1"]);
  });
});
