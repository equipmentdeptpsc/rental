import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import "./index.css";

import { router } from "@/app/router";

import { AuthProvider } from "@/features/auth/AuthContext";

import { EquipmentProvider } from "@/features/equipment/context/EquipmentContext";
import { AuditProvider } from "@/features/equipment/audit/AuditContext";

import { EquipmentHistoryProvider } from "@/features/equipment/history";

import { AssignmentProvider } from "@/features/assignment/context/AssignmentContext";

import { RentalProvider } from "@/features/rental/context/RentalContext";

import { CustomerProvider } from "@/features/customer/context/CustomerContext";

import { ProjectProvider } from "@/features/project/context/ProjectContext";

import { MaintenanceProvider } from "@/features/maintenance/context/MaintenanceContext";

import { DailyLogProvider } from "@/features/daily-log";

import { OperatorProvider } from "@/features/operators/context/OperatorContext";

import { ToastProvider } from "@/components/ui/toast/ToastContext";

ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <React.StrictMode>
    <AuthProvider>
      <ToastProvider>
        <AuditProvider>
          <EquipmentProvider>
            <EquipmentHistoryProvider>
              <OperatorProvider>
                <CustomerProvider>
                  <ProjectProvider>
                    <MaintenanceProvider>
                      <DailyLogProvider>
                        <AssignmentProvider>
                          <RentalProvider>
                            <RouterProvider router={router} />
                          </RentalProvider>
                        </AssignmentProvider>
                      </DailyLogProvider>
                    </MaintenanceProvider>
                  </ProjectProvider>
                </CustomerProvider>
              </OperatorProvider>
            </EquipmentHistoryProvider>
          </EquipmentProvider>
        </AuditProvider>
      </ToastProvider>
    </AuthProvider>
  </React.StrictMode>
);