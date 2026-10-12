import { useEffect, useState } from "react";

import type { CanonicalRentalRemoteRepository } from "@/features/rental/remote/contracts";

interface Props {
  activityCodeId?: string;
  repository?: Pick<CanonicalRentalRemoteRepository, "readReferenceData">;
}

export default function RemoteAssignmentActivityCodeDisplay({ activityCodeId, repository }: Props) {
  const [label, setLabel] = useState("Loading Activity Code…");

  useEffect(() => {
    if (!activityCodeId) { setLabel("Not configured"); return; }
    if (!repository) { setLabel("Activity Code unavailable"); return; }
    let active = true;
    setLabel("Loading Activity Code…");
    void repository.readReferenceData().then((result) => {
      if (!active) return;
      const code = result.success ? result.value.activityCodes.find((item) => item.id === activityCodeId) : undefined;
      setLabel(code ? `${code.code} — ${code.name}` : "Activity Code unavailable or inactive");
    }).catch(() => { if (active) setLabel("Activity Code unavailable"); });
    return () => { active = false; };
  }, [activityCodeId, repository]);

  return <div><div className="text-sm font-medium text-slate-500">Activity Code</div><div className="mt-1 font-medium">{label}</div></div>;
}
