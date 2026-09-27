import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const repo=readFileSync("src/integrations/supabase/SupabaseDeurCommandRepository.ts","utf8");
const create=readFileSync("src/features/rental/workspace/deur/RemoteManualDeurAction.tsx","utf8");
const workspace=readFileSync("src/features/rental/workspace/deur/RemoteManualDeurWorkspace.tsx","utf8");
describe("remote manual DEUR Phase 3",()=>{
 it("uses every canonical Phase 1/2 RPC",()=>{for(const name of ["command_create_manual_deur","command_record_manual_deur_activity","command_record_manual_deur_travel_checkpoint","command_record_manual_deur_refuel","command_complete_manual_deur_shift","command_submit_manual_deur"])expect(repo).toContain(name)});
 it("gates create and record surfaces with narrow flags",()=>{expect(create).toContain("VITE_REMOTE_MANUAL_DEUR_CREATE_ENABLED");expect(workspace).toContain("VITE_REMOTE_MANUAL_DEUR_RECORD_ENABLED")});
 it("does not accept client identity overrides",()=>{expect(create).not.toContain("operatorId:");expect(create).not.toContain("equipmentId:");expect(create).not.toContain("assignmentId:")});
 it("labels the canonical source",()=>{expect(create).toContain("MANUAL_WEB");expect(workspace).toContain("MANUAL_WEB")});
});
