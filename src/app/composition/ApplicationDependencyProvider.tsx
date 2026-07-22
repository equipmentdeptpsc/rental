import { useState, type ReactNode } from "react";
import type { ApplicationDependencies } from "./ApplicationDependencies";
import { createApplicationDependencies } from "./createApplicationDependencies";
import { ApplicationDependencyContext } from "./dependencyContext";

export function ApplicationDependencyProvider({ children, dependencies }: { children?: ReactNode; dependencies?: ApplicationDependencies }) {
  const [stableDependencies] = useState(() => dependencies ?? createApplicationDependencies());
  return <ApplicationDependencyContext.Provider value={stableDependencies}>{children}</ApplicationDependencyContext.Provider>;
}
