import type {
    BillingPreviewLine,
  } from "../types";
  
  interface Props {
    line: BillingPreviewLine;
  
  }
  
  export default function BillingLineRow({
    line,
  }: Props) {
    const optionalCharges = [
      ["Idle", line.idleCharge], ["Mobilization", line.mobilizationCharge],
      ["Demobilization", line.demobilizationCharge], ["Operator", line.operatorCharge], ["Fuel", line.fuelCharge],
    ].filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0);
    return (
      <tr>

        <td className="px-3 py-2">{line.equipmentId ?? "Legacy header equipment"}</td>

        <td className="px-3 py-2">{line.operator || line.operatorId || "—"}</td>

        <td className="px-3 py-2">
          {line.deurReference ?? line.deurId}
        </td>
  
        <td className="px-3 py-2">
          {line.workDate}
        </td>
  
        <td className="px-3 py-2">
  
          <div>{line.description}</div>
          {optionalCharges.length > 0 && <div className="mt-1 text-xs text-slate-500">{optionalCharges.map(([label, value]) => `${label}: ₱${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`).join(" · ")}</div>}
  
        </td>
  
        <td className="px-3 py-2">
  
          {line.costCode || "—"}
  
        </td>
  
        <td className="px-3 py-2 text-right">
          {line.quantity !== undefined ? `${line.quantity.toFixed(2)} ${line.unit ?? ""}` : `${line.actualHours.toFixed(2)} h`}
        </td>
  
        <td className="px-3 py-2">
  
          {line.hourlyRate.toLocaleString(undefined, { minimumFractionDigits: 2 })}
  
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
