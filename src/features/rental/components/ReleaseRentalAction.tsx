import { useEffect, useMemo, useState } from "react";

import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { useToast } from "@/components/ui/toast/ToastContext";
import { useAuth } from "@/features/auth/AuthContext";
import { useRental } from "@/features/rental/context/RentalContext";
import { selectAdminUsers } from "@/features/rental/utils/rentalFormOptions";

interface Props {
  rentalId: string;
}

export default function ReleaseRentalAction({ rentalId }: Props) {
  const { user } = useAuth();
  const { releaseRental } = useRental();
  const { showToast } = useToast();
  const adminUsers = useMemo(() => selectAdminUsers(user ? [user] : []), [user]);
  const [releasedById, setReleasedById] = useState("");

  useEffect(() => {
    setReleasedById(adminUsers[0]?.id ?? "");
  }, [adminUsers]);

  if (adminUsers.length === 0) {
    return <p className="text-sm text-amber-700">An Admin must sign in before this equipment can be released.</p>;
  }

  function release() {
    const admin = adminUsers.find((candidate) => candidate.id === releasedById);
    const result = releaseRental(rentalId, admin?.name ?? "");

    if (!result.success) {
      showToast(result.message ?? "Unable to release equipment.", "error");
      return;
    }

    showToast("Equipment released successfully.", "success");
  }

  return (
    <div className="flex items-end gap-2">
      <Select
        label="Released By"
        value={releasedById}
        options={adminUsers.map((admin) => ({ value: admin.id, label: admin.name }))}
        onChange={(event) => setReleasedById(event.target.value)}
      />
      <Button variant="secondary" onClick={release}>Release</Button>
    </div>
  );
}
