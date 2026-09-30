import { describe, expect, it } from "vitest";
import { getSafeRemoteDiagnostic, mapRemoteError } from "@/core/remote/errorMapper";

describe("workspace read diagnostics", () => {
  it("retains sanitized PostgREST fields needed to diagnose a read failure", () => {
    const error = mapRemoteError({
      code: "PGRST200",
      status: 400,
      message: "Could not find a relationship between deur_events and deur_event_supersessions",
      details: "Searched for a foreign key relationship in schema erp.",
      hint: "Verify the relation is available in the schema cache.",
    }, { repository: "DEUR", operation: "list" });
    expect(getSafeRemoteDiagnostic(error)).toEqual({
      code: "PGRST200",
      status: 400,
      message: "Could not find a relationship between deur_events and deur_event_supersessions",
      details: "Searched for a foreign key relationship in schema erp.",
      hint: "Verify the relation is available in the schema cache.",
    });
  });

  it("redacts credential-shaped text from a remote diagnostic", () => {
    const error = mapRemoteError({ code: "XX000", message: "token=unsafe-value", details: "authorization: unsafe-value" }, { repository: "DEUR", operation: "list" });
    expect(JSON.stringify(getSafeRemoteDiagnostic(error))).not.toContain("unsafe-value");
  });
});
