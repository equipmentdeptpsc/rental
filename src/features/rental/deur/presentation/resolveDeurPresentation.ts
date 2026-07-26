import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import type { DeurRecord } from "../types";

export function resolveDeurPresentation(input:{deur:DeurRecord;lines:RentalEquipmentLine[];equipment:EquipmentRecord[];operators:Operator[]}){
  const line=input.lines.find(item=>item.id===input.deur.rentalEquipmentLineId);
  const machine=input.equipment.find(item=>item.id===(line?.equipmentId??input.deur.equipmentId));
  const operator=input.operators.find(item=>item.id===(line?.operatorId??input.deur.operatorId));
  const lineIndex=line?input.lines.filter(item=>item.rentalId===line.rentalId).findIndex(item=>item.id===line.id):-1;
  return{
    equipment:machine?`${machine.equipmentName} (${machine.assetNo})`:"Equipment unavailable",
    line:line?`${machine?.equipmentName??"Equipment"} / Rental Line ${lineIndex+1}`:"Legacy line reference unavailable",
    operator:operator?.name??"Operator not assigned",
  };
}
