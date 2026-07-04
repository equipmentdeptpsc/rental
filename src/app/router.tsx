import { createBrowserRouter } from "react-router-dom";

import AppLayout from "./AppLayout";

import Dashboard from "@/pages/Dashboard";
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

// Rentals
import RentalPage from "@/pages/Rental";
import NewRental from "@/pages/Rental/New";
import ReturnRental from "@/pages/Rental/Return";

// Maintenance
import MaintenancePage from "@/pages/Maintenance";
import NewMaintenance from "@/pages/Maintenance/New";
import MaintenanceDetails from "@/pages/Maintenance/Details";

// Other Modules
import Bookings from "@/pages/Bookings";
import DailyLogs from "@/pages/DailyLogs";
import Billing from "@/pages/Billing";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import AssignmentDetails from "@/pages/Assignments/Details";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    errorElement: <NotFound />,

    children: [
      // ==========================
      // Dashboard
      // ==========================
      {
        index: true,
        element: <Dashboard />,
      },

      // ==========================
      // Equipment
      // ==========================
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
        path: "equipment/:id",
        element: <EquipmentDetails />,
      },

      // ==========================
      // Customers
      // ==========================
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

      // ==========================
      // Operators
      // ==========================
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

      // ==========================
      // Projects
      // ==========================
      {
        path: "projects",
        element: <Projects />,
      },
      {
        path: "projects/new",
        element: <NewProject />,
      },

      // ==========================
      // Rentals
      // ==========================
      {
        path: "rentals",
        element: <RentalPage />,
      },
      {
        path: "rentals/new",
        element: <NewRental />,
      },
      {
        path: "rentals/return/:id",
        element: <ReturnRental />,
      },

      // ==========================
      // Maintenance
      // ==========================
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

      // ==========================
      // Other Modules
      // ==========================
      {
        path: "bookings",
        element: <Bookings />,
      },
      {
        path: "daily-logs",
        element: <DailyLogs />,
      },
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
        path: "assignments/:id",
        element: <AssignmentDetails />,
      }
    ],
  },
]);