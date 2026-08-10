import type { ReactNode } from "react";

import { ActivityCodeProvider } from "@/features/masters/activity-code/context/ActivityCodeContext";
import { CostCodeProvider } from "@/features/masters/cost-code/context/CostCodeContext";
import { WorkDescriptionProvider } from "@/features/masters/work-description";

import { EquipmentBrandProvider } from "@/features/masters/equipment-brand/context/EquipmentBrandContext";
import { EquipmentCategoryProvider } from "@/features/masters/equipment-category/context/EquipmentCategoryContext";
import { EquipmentConditionProvider } from "@/features/masters/equipment-condition/context/EquipmentConditionContext";
import { EquipmentLocationProvider } from "@/features/masters/equipment-location/context/EquipmentLocationContext";
import { EquipmentModelProvider } from "@/features/masters/equipment-model/context/EquipmentModelContext";
import { EquipmentOwnershipProvider } from "@/features/masters/equipment-ownership/context/EquipmentOwnershipContext";
import { EquipmentStatusProvider } from "@/features/masters/equipment-status/context/EquipmentStatusContext";
import { EquipmentTypeProvider } from "@/features/masters/equipment-type/context/EquipmentTypeContext";

import { RentalStatusProvider } from "@/features/masters/rental-status/context/RentalStatusContext";
import { IdleReasonProvider } from "@/features/masters/idle-reason/context";
import { EquipmentSubcategoryProvider } from "@/features/masters/equipment-subcategory/context";
import { initializeRequiredMasterData } from "@/features/masters/initializeRequiredMasterData";


export default function MasterProviders({
  children,
}: {
  children: ReactNode;
}) {
  initializeRequiredMasterData();

  return (
    <EquipmentSubcategoryProvider><IdleReasonProvider><WorkDescriptionProvider>

    <ActivityCodeProvider>

      <CostCodeProvider>

        <EquipmentBrandProvider>

          <EquipmentCategoryProvider>

            <EquipmentConditionProvider>

              <EquipmentLocationProvider>

                <EquipmentModelProvider>

                  <EquipmentOwnershipProvider>

                    <EquipmentStatusProvider>

                      <EquipmentTypeProvider>

                        <RentalStatusProvider>

                          {children}

                        </RentalStatusProvider>

                      </EquipmentTypeProvider>

                    </EquipmentStatusProvider>

                  </EquipmentOwnershipProvider>

                </EquipmentModelProvider>

              </EquipmentLocationProvider>

            </EquipmentConditionProvider>

          </EquipmentCategoryProvider>

        </EquipmentBrandProvider>

      </CostCodeProvider>

    </ActivityCodeProvider>

    </WorkDescriptionProvider></IdleReasonProvider></EquipmentSubcategoryProvider>
  );
}
