import Overview from "./overview/Overview";
import DeurWorkspace from "./deur/DeurWorkspace";

export { default as RentalWorkspaceProvider } from "./RentalWorkspaceProvider";

export { useRentalWorkspaceAggregate } from "./RentalWorkspaceProvider";

export { default as RentalWorkspaceLayout } from "./layout/RentalWorkspaceLayout";

export default function RentalWorkspace() {
  return (
    <div className="space-y-8">
      <Overview />

      <DeurWorkspace />
    </div>
  );
}