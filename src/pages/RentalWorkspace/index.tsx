import {
  useParams,
} from "react-router-dom";

import {
  RentalWorkspaceProvider,
  RentalWorkspaceLayout,
} from "@/features/rental/workspace";

import WorkspaceContent from "@/features/rental/workspace/layout/WorkspaceContent";

export default function RentalWorkspacePage() {
  const {
    rentalId,
  } = useParams();

  if (!rentalId) {
    return (
      <div className="p-8">
        Invalid rental.
      </div>
    );
  }

  return (
    <RentalWorkspaceProvider
      rentalId={rentalId}
    >
      <RentalWorkspaceLayout>

        <WorkspaceContent />

      </RentalWorkspaceLayout>
    </RentalWorkspaceProvider>
  );
}