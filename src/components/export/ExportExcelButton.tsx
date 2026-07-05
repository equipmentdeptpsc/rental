import Button from "@/components/ui/Button";

import { exportToExcel } from "@/utils/exportToExcel";

interface Props<T> {
  data: T[];

  fileName: string;

  transform?(
    row: T
  ): Record<string, unknown>;
}

export default function ExportExcelButton<T>({
  data,
  fileName,
  transform,
}: Props<T>) {
  function handleExport() {
    if (transform) {
      exportToExcel(
        data.map(transform),
        fileName
      );
    } else {
      exportToExcel(
        data,
        fileName
      );
    }
  }

  return (
    <Button
      onClick={handleExport}
    >
      Export Excel
    </Button>
  );
}