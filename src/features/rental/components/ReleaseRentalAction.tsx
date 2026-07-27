import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { useToast } from "@/components/ui/toast/ToastContext";
import { useAuth } from "@/features/auth/AuthContext";
import { useRental } from "@/features/rental/context/RentalContext";

interface Props {
  rentalId: string;
}

export default function ReleaseRentalAction({ rentalId }: Props) {
  const { user } = useAuth();
  const { releaseRental } = useRental();
  const { showToast } = useToast();
  const location = useLocation();
  const adminUsers = useMemo(() => user ? [user] : [], [user]);
  const [releasedById, setReleasedById] = useState("");

  useEffect(() => {
    setReleasedById(adminUsers[0]?.id ?? "");
  }, [adminUsers]);

  if (adminUsers.length === 0) {
    return (
      <p className="text-sm text-amber-700">
        {user ? "Only an Admin can release this equipment." : "Sign in as Admin to release this equipment. "}
        {!user && <Link className="underline font-medium" to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>Sign in</Link>}
      </p>
    );
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
