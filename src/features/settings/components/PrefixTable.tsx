import Button from "@/components/ui/Button";

import type { PrefixRecord } from "../types";

interface Props {
  prefixes: PrefixRecord[];
  onEdit(item: PrefixRecord): void;
}

export default function PrefixTable({
  prefixes,
  onEdit,
}: Props) {
  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <table className="min-w-full">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-3 text-left">Code</th>
            <th className="p-3 text-left">Description</th>
            <th className="p-3 text-left">Digits</th>
            <th className="p-3 text-left">Next Number</th>
            <th className="p-3 text-left">Preview</th>
            <th className="p-3 text-left">Action</th>
          </tr>
        </thead>

        <tbody>
          {prefixes.map((item) => (
            <tr
              key={item.id}
              className="border-t"
            >
              <td className="p-3 font-medium">
                {item.code}
              </td>

              <td className="p-3">
                {item.description}
              </td>

              <td className="p-3">
                {item.digits}
              </td>

              <td className="p-3">
                {item.nextNumber}
              </td>

              <td className="p-3 font-mono">
                {`${item.code}-${String(item.nextNumber).padStart(
                  item.digits,
                  "0"
                )}`}
              </td>

              <td className="p-3">
                <Button
                  type="button"
                  onClick={() => onEdit(item)}
                >
                  Edit
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
