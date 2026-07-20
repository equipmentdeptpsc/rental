import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { EquipmentCategory, PrefixRecord } from "../types";
import { prefixRepository, type PrefixMutationResult } from "../repository/prefixRepository";

interface PrefixContextType {
  prefixes: PrefixRecord[];
  addPrefix(item: PrefixRecord): PrefixMutationResult;
  updatePrefix(item: PrefixRecord): PrefixMutationResult;
  activatePrefix(id: string): PrefixMutationResult;
  getActivePrefix(): PrefixRecord | undefined;
  getPrefixByCategory(category: EquipmentCategory): PrefixRecord | undefined;
}
const PrefixContext = createContext<PrefixContextType | undefined>(undefined);

export function PrefixProvider({ children }: { children: ReactNode }) {
  const [prefixes, setPrefixes] = useState(() => prefixRepository.getAll());
  const refresh = () => setPrefixes(prefixRepository.getAll());
  function addPrefix(item: PrefixRecord) { const result = prefixRepository.create(item); if (result.success) refresh(); return result; }
  function updatePrefix(item: PrefixRecord) { const result = prefixRepository.update(item); if (result.success) refresh(); return result; }
  function activatePrefix(id: string) {
    const selected = prefixRepository.get(id); if (!selected) return { success: false as const, code: "PREFIX_NOT_FOUND", message: "Prefix was not found." };
    const result = prefixRepository.update({ ...selected, active: true }); if (result.success) refresh(); return result;
  }
  const value = useMemo(() => ({ prefixes, addPrefix, updatePrefix, activatePrefix, getActivePrefix: () => prefixes.find((item) => item.active), getPrefixByCategory: (category: EquipmentCategory) => prefixes.find((item) => item.active && item.category === category) }), [prefixes]);
  return <PrefixContext.Provider value={value}>{children}</PrefixContext.Provider>;
}
export function usePrefix() { const context = useContext(PrefixContext); if (!context) throw new Error("usePrefix must be used inside PrefixProvider."); return context; }
