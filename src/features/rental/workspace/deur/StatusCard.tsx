import type {
    DeurStatus,
  } from "@/features/rental/deur/types";
  
  interface Props {
    status?: DeurStatus;
  }
  
  export default function StatusCard({
    status,
  }: Props) {
    return (
      <div className="rounded-lg border bg-white p-6">
  
        <h3 className="mb-4 text-lg font-semibold">
          DEUR Status
        </h3>
  
        <div className="text-xl font-semibold">
  
          {status ?? "No DEUR"}
  
        </div>
  
      </div>
    );
  }