import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import { router } from "@/app/router";
import AppErrorBoundary from "@/app/AppErrorBoundary";

import { AuthProvider } from "@/features/auth/AuthContext";

import { ToastProvider } from "@/components/ui/toast/ToastContext";

import { PrefixProvider } from "@/features/settings/context/PrefixContext";

import { AuditProvider } from "@/features/equipment/audit/AuditContext";

import MasterProviders from "@/app/MasterProviders";

import { EquipmentProvider } from "@/features/equipment/context/EquipmentContext";
import { EquipmentHistoryProvider } from "@/features/equipment/history";

import { DailyLogProvider } from "@/features/daily-log";

import { AssignmentProvider } from "@/features/assignment/context/AssignmentContext";
import { RentalProvider } from "@/features/rental/context/RentalContext";
import { MaintenanceProvider } from "@/features/maintenance/context/MaintenanceContext";

import { OperatorProvider } from "@/features/operators/context/OperatorContext";
import { CustomerProvider } from "@/features/customer/context/CustomerContext";
import { ProjectProvider } from "@/features/project/context/ProjectContext";

import "./index.css";


function AppProviders() {
  return (
    <AuthProvider>

      <ToastProvider>

        <PrefixProvider>

          <AuditProvider>

            <MasterProviders>

              <EquipmentProvider>

                <EquipmentHistoryProvider>

                  <DailyLogProvider>

                    <OperatorProvider>

                      <CustomerProvider>

                        <ProjectProvider>

                          <AssignmentProvider>

                            <RentalProvider>

                              <MaintenanceProvider>

                                {/** Application Routes */}
                                <RouterProvider router={router} />

                              </MaintenanceProvider>

                            </RentalProvider>

                          </AssignmentProvider>

                        </ProjectProvider>

                      </CustomerProvider>

                    </OperatorProvider>

                  </DailyLogProvider>

                </EquipmentHistoryProvider>

              </EquipmentProvider>

            </MasterProviders>

          </AuditProvider>

        </PrefixProvider>

      </ToastProvider>

    </AuthProvider>
  );
}


ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <AppProviders />
    </AppErrorBoundary>
  </React.StrictMode>
);
