import type {
    BillingPreviewLine,
  } from "../types";
import { formatOperationalHours, formatPhpCurrency } from "@/features/rental/presentation/formatBusinessValues";
  
  interface Props {
    line: BillingPreviewLine;
  
  }
  
  export default function BillingLineRow({
    line,
  }: Props) {
    const optionalCharges = [
      ["Idle", line.idleCharge], ["Standby", line.standbyCharge], ["Mobilization", line.mobilizationCharge],
      ["Demobilization", line.demobilizationCharge], ["Operator", line.operatorCharge], ["Fuel", line.fuelCharge],
    ].filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0);
    return (
      <tr>

        <td className="px-3 py-2">{line.equipmentLabel ?? "Equipment record unavailable"}</td>

        <td className="px-3 py-2">{line.operatorLabel ?? "Operator not assigned"}</td>

        <td className="px-3 py-2">
          {line.deurReference ?? "DEUR number unavailable"}
        </td>
  
        <td className="px-3 py-2">
          {line.workDate}
        </td>
  
        <td className="px-3 py-2">
  
          <div>{line.description}</div>
          {optionalCharges.length > 0 && <div className="mt-1 text-xs text-slate-500">{optionalCharges.map(([label, value]) => `${label}: ${formatPhpCurrency(value)}`).join(" · ")}</div>}
  
        </td>
  
        <td className="px-3 py-2">
  
          {line.costCode || "—"}
  
        </td>
  
        <td className="px-3 py-2 text-right">
          {line.quantity !== undefined ? `${line.quantity.toFixed(2)} ${line.unit ?? ""}` : formatOperationalHours(line.actualHours)}
        </td>
  
        <td className="px-3 py-2">
  
          {formatPhpCurrency(line.hourlyRate)}
  
        </td>
  
        <td className="px-3 py-2 text-right">
  
          {formatPhpCurrency(line.amount)}
  
        </td>
  
      </tr>
    );
  }
