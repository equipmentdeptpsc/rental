import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import "./index.css";

import { router } from "@/app/router";

import { AuthProvider } from "@/features/auth/AuthContext";

import { EquipmentProvider } from "@/features/equipment/context/EquipmentContext";
import { AuditProvider } from "@/features/equipment/audit/AuditContext";

import { RentalProvider } from "@/features/rental/context/RentalContext";

import { CustomerProvider } from "@/features/customer/context/CustomerContext";
import { ProjectProvider } from "@/features/project/context/ProjectContext";

import { MaintenanceProvider } from "@/features/maintenance/context/MaintenanceContext";

import { OperatorProvider } from "@/features/operators/context/OperatorContext";

// import { AssignmentProvider } from "@/features/assignment/context/AssignmentContext";

import { ToastProvider } from "@/components/ui/toast/ToastContext";

ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <React.StrictMode>
    <AuthProvider>
      <ToastProvider>
        <AuditProvider>
          <EquipmentProvider>
            <OperatorProvider>
              <CustomerProvider>
                <ProjectProvider>
                  <MaintenanceProvider>
                    <RentalProvider>
                      <RouterProvider router={router} />
                    </RentalProvider>
                  </MaintenanceProvider>
                </ProjectProvider>
              </CustomerProvider>
            </OperatorProvider>
          </EquipmentProvider>
        </AuditProvider>
      </ToastProvider>
    </AuthProvider>
  </React.StrictMode>
);