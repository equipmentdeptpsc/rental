import { createContext, useContext } from "react";
import type { ApplicationDependencies } from "./ApplicationDependencies";
import { createLocalApplicationDependencies } from "./createLocalApplicationDependencies";

export const ApplicationDependencyContext = createContext<ApplicationDependencies | undefined>(undefined);
const legacyLocalDependencies = createLocalApplicationDependencies();
export function useApplicationDependencies(): ApplicationDependencies { const dependencies = useContext(ApplicationDependencyContext); if (!dependencies) throw new Error("APPLICATION_DEPENDENCIES_MISSING: Wrap feature providers in ApplicationDependencyProvider and supply an ApplicationDependencies root."); return dependencies; }
/** @deprecated Compatibility for feature providers mounted outside application bootstrap. */
export function useApplicationDependenciesCompatibility(): ApplicationDependencies { return useContext(ApplicationDependencyContext) ?? legacyLocalDependencies; }
