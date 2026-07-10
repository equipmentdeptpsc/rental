import type {
    BillingPreviewLine,
  } from "../types";
  
  interface Props {
    line: BillingPreviewLine;
  
    onChange(
      line: BillingPreviewLine
    ): void;
  }
  
  export default function BillingLineRow({
    line,
    onChange,
  }: Props) {
  
    function update(
      changes: Partial<BillingPreviewLine>
    ) {
  
      const updated = {
        ...line,
        ...changes,
      };
  
      updated.amount =
        updated.actualHours *
        updated.hourlyRate;
  
      onChange(updated);
    }
  
    return (
      <tr>
  
        <td className="px-3 py-2">
          {line.workDate}
        </td>
  
        <td className="px-3 py-2">
  
          <input
            value={line.description}
            onChange={(e) =>
              update({
                description:
                  e.target.value,
              })
            }
            className="w-full rounded border px-2 py-1"
          />
  
        </td>
  
        <td className="px-3 py-2">
  
          <input
            value={line.costCode}
            onChange={(e) =>
              update({
                costCode:
                  e.target.value,
              })
            }
            className="w-full rounded border px-2 py-1"
          />
  
        </td>
  
        <td className="px-3 py-2 text-right">
          {line.actualHours.toFixed(2)}
        </td>
  
        <td className="px-3 py-2">
  
          <input
            type="number"
            value={line.hourlyRate}
            onChange={(e) =>
              update({
                hourlyRate:
                  Number(
                    e.target.value
                  ),
              })
            }
            className="w-24 rounded border px-2 py-1 text-right"
          />
  
        </td>
  
        <td className="px-3 py-2 text-right">
  
          ₱
          {line.amount.toLocaleString(
            undefined,
            {
              minimumFractionDigits:2,
            }
          )}
  
        </td>
  
      </tr>
    );
  }