import { useState, type ReactNode } from "react";
import type { ApplicationDependencies } from "./ApplicationDependencies";
import { createLocalApplicationDependencies } from "./createLocalApplicationDependencies";
import { ApplicationDependencyContext } from "./dependencyContext";

export function ApplicationDependencyProvider({ children, dependencies }: { children?: ReactNode; dependencies?: ApplicationDependencies }) {
  const [stableDependencies] = useState(() => dependencies ?? createLocalApplicationDependencies());
  return <ApplicationDependencyContext.Provider value={stableDependencies}>{children}</ApplicationDependencyContext.Provider>;
}
