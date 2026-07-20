import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import {
  workDescriptionRepository,
  type WorkDescriptionMutationResult,
} from "../repository";
import type { WorkDescriptionRecord } from "../types";

interface Value {
  records: WorkDescriptionRecord[];
  create(record: WorkDescriptionRecord): WorkDescriptionMutationResult;
  update(record: WorkDescriptionRecord): WorkDescriptionMutationResult;
  softDelete(id: string): void;
  restore(id: string): void;
}

const WorkDescriptionContext = createContext<Value | undefined>(undefined);

export function WorkDescriptionProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const records = useMemo(() => workDescriptionRepository.getAll(), [version]);
  const refresh = () => setVersion((current) => current + 1);

  const value: Value = {
    records,
    create(record) {
      const result = workDescriptionRepository.create(record);
      if (result.success) refresh();
      return result;
    },
    update(record) {
      const result = workDescriptionRepository.update(record);
      if (result.success) refresh();
      return result;
    },
    softDelete(id) { workDescriptionRepository.softDelete(id); refresh(); },
    restore(id) { workDescriptionRepository.restore(id); refresh(); },
  };

  return <WorkDescriptionContext.Provider value={value}>{children}</WorkDescriptionContext.Provider>;
}

export function useWorkDescriptions() {
  const context = useContext(WorkDescriptionContext);
  if (!context) throw new Error("useWorkDescriptions must be used inside WorkDescriptionProvider.");
  return context;
}
