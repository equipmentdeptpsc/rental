import { createBrowserRouter } from "react-router-dom";
import { lazy, Suspense } from "react";

import AppLayout from "./AppLayout";

// Dashboard
import Dashboard from "@/pages/Dashboard/index.tsx";
import NotFound from "@/pages/NotFound";

// Equipment
import Equipment from "@/pages/Equipment";
import NewEquipment from "@/pages/Equipment/New";
import EditEquipment from "@/pages/Equipment/Edit";
import EquipmentDetails from "@/pages/Equipment/Details";

// Customers
import CustomerPage from "@/pages/Customers";
import NewCustomer from "@/pages/Customers/New";
import CustomerDetails from "@/pages/Customers/Details";
import EditCustomer from "@/pages/Customers/Edit";

// Operators
import Operators from "@/pages/Operators";
import NewOperator from "@/pages/Operators/New";
import EditOperator from "@/pages/Operators/Edit";

// Projects
import Projects from "@/pages/Projects";
import NewProject from "@/pages/Projects/New";
import EditProject from "@/pages/Projects/Edit";

// Assignments
import Assignments from "@/pages/Assignments";
import NewAssignment from "@/pages/Assignments/New";
import AssignmentDetails from "@/pages/Assignments/Details";
import EditAssignment from "@/pages/Assignments/Edit";

// Rentals
import RentalPage from "@/pages/Rental";
import NewRental from "@/pages/Rental/New";
import ReturnRental from "@/pages/Rental/Return";
import RentalWorkspacePage from "@/pages/RentalWorkspace";
import RentalCommercialTermsPage from "@/pages/Rental/CommercialTerms";
import OperatorDeurPage from "@/pages/OperatorDeur";

// Maintenance
import MaintenancePage from "@/pages/Maintenance";
import NewMaintenance from "@/pages/Maintenance/New";
import MaintenanceDetails from "@/pages/Maintenance/Details";

// Daily Logs
import DailyLogs from "@/pages/DailyLogs/index.tsx";
import NewDailyLog from "@/pages/DailyLogs/New";

// Other Modules
import Billing from "@/pages/Billing";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import EquipmentTrash from "@/pages/Equipment/Trash";
import Login from "@/pages/Login";
import DevelopmentEmailOutboxPage from "@/pages/DevelopmentEmailOutbox";
import DevelopmentEmailPreviewPage from "@/pages/DevelopmentEmailOutbox/Preview";
import RentalApprovalPage from "@/pages/RentalApproval";
import CustomerDeurReviewPage from "@/pages/CustomerDeurReview";

const ActivityCodePage = lazy(() => import("@/features/masters/activity-code/pages"));
const WorkDescriptionPage = lazy(() => import("@/features/masters/work-description/pages"));

export const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  {
    path: "/",
    element: <AppLayout />,
    errorElement: <NotFound />,

    children: [
      // ====================================
      // Dashboard
      // ====================================
      {
        index: true,
        element: <Dashboard />,
      },

      // ====================================
      // Equipment
      // ====================================
      {
        path: "equipment",
        element: <Equipment />,
      },
      {
        path: "equipment/new",
        element: <NewEquipment />,
      },
      {
        path: "equipment/edit/:id",
        element: <EditEquipment />,
      },
      {
        path: "equipment/trash",
        element: <EquipmentTrash />,
      },
      {
        path: "equipment/:id",
        element: <EquipmentDetails />,
      },

      // ====================================
      // Customers
      // ====================================
      {
        path: "customers",
        element: <CustomerPage />,
      },
      {
        path: "customers/new",
        element: <NewCustomer />,
      },
      {
        path: "customers/:id",
        element: <CustomerDetails />,
      },
      {
        path: "customers/edit/:id",
        element: <EditCustomer />,
      },

      // ====================================
      // Operators
      // ====================================
      {
        path: "operators",
        element: <Operators />,
      },
      {
        path: "operators/new",
        element: <NewOperator />,
      },
      {
        path: "operators/edit/:id",
        element: <EditOperator />,
      },

      // ====================================
      // Projects
      // ====================================
      {
        path: "projects",
        element: <Projects />,
      },
      {
        path: "projects/new",
        element: <NewProject />,
      },
      {
        path: "projects/:id/edit",
        element: <EditProject />,
      },

      // ====================================
      // Assignments
      // ====================================
      {
        path: "assignments",
        element: <Assignments />,
      },
      {
        path: "assignments/new",
        element: <NewAssignment />,
      },
      {
        path: "assignments/:id/edit",
        element: <EditAssignment />,
      },
      {
        path: "assignments/:id",
        element: <AssignmentDetails />,
      },

      // ====================================
      // Rentals
      // ====================================
      {
        path: "rentals",
        element: <RentalPage />,
      },
      {
        path: "rentals/new",
        element: <NewRental />,
      },
      {
        path: "rentals/:rentalId/workspace",
        element: <RentalWorkspacePage />,
      },
      {
        path: "rentals/:rentalId/commercial-terms",
        element: <RentalCommercialTermsPage />,
      },
      {
        path: "rentals/:rentalId/operator-deur",
        element: <OperatorDeurPage />,
      },
      {
        path: "rentals/return/:id",
        element: <ReturnRental />,
      },
      {
        path: "rental-approval/:token",
        element: <RentalApprovalPage />,
      },
      {
        path: "customer-deur-review/:deurId",
        element: <CustomerDeurReviewPage />,
      },

      // ====================================
      // Maintenance
      // ====================================
      {
        path: "maintenance",
        element: <MaintenancePage />,
      },
      {
        path: "maintenance/new",
        element: <NewMaintenance />,
      },
      {
        path: "maintenance/:id",
        element: <MaintenanceDetails />,
      },

      // ====================================
      // Daily Logs
      // ====================================
      {
        path: "daily-logs",
        element: <DailyLogs />,
      },
      {
        path: "daily-logs/new",
        element: <NewDailyLog />,
      },

      // ====================================
      // Other Modules
      // ====================================
            {
        path: "billing",
        element: <Billing />,
      },
      {
        path: "reports",
        element: <Reports />,
      },
      {
        path: "settings",
        element: <Settings />,
      },
      {
        path: "development-email-outbox",
        element: <DevelopmentEmailOutboxPage />,
      },
      {
        path: "development-email-outbox/:id",
        element: <DevelopmentEmailPreviewPage />,
      },
      {
        path: "settings/activity-codes",
        element: (
          <Suspense fallback={<div className="p-8 text-slate-500">Loading Activity Codes…</div>}>
            <ActivityCodePage />
          </Suspense>
        ),
      },
      {
        path: "settings/work-descriptions",
        element: (
          <Suspense fallback={<div className="p-8 text-slate-500">Loading Work Descriptions…</div>}>
            <WorkDescriptionPage />
          </Suspense>
        ),
      },
    ],
  },
]);
