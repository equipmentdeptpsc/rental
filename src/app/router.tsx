import { createBrowserRouter } from "react-router-dom";

import AppLayout from "./AppLayout";

import Dashboard from "@/pages/Dashboard";

import Equipment from "@/pages/Equipment";
import NewEquipment from "@/pages/Equipment/New";
import EditEquipment from "@/pages/Equipment/Edit";
import EquipmentDetails from "@/pages/Equipment/Details";

import RentalPage from "@/pages/Rental";
import NewRental from "@/pages/Rental/New";
import ReturnRental from "@/pages/Rental/Return";

import MaintenancePage from "@/pages/Maintenance";
import NewMaintenance from "@/pages/Maintenance/New";

import Operators from "@/pages/Operators";
import Projects from "@/pages/Projects";
import Bookings from "@/pages/Bookings";
import DailyLogs from "@/pages/DailyLogs";
import Billing from "@/pages/Billing";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/NotFound";
import MaintenanceDetails from "@/pages/Maintenance/Details";
import CustomerPage from "@/pages/Customers";
import NewCustomer from "@/pages/Customers/New";
import CustomerDetails from "@/pages/Customers/Details";
import EditCustomer from "@/pages/Customers/Edit";
import NewProject from "@/pages/Projects/New";
import OperatorsPage from "@/pages/Operators";
import NewOperator from "@/pages/Operators/New";
import EditOperator from "@/pages/Operators/Edit";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    errorElement: <NotFound />,
    children: [
      {
        index: true,
        element: <Dashboard />,
      },

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

      {
        path: "maintenance",
        element: <MaintenancePage />,
      },
      {
        path: "maintenance/new",
        element: <NewMaintenance />,
      },

      {
        path: "operators",
        element: <Operators />,
      },
      {
        path: "projects",
        element: <Projects />,
      },
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
        path: "maintenance/:id",
        element: <MaintenanceDetails />,
      },
      {
        path: "customers",
        element: <CustomerPage />,
      },
      {
        path: "customers/new",
        element: <NewCustomer />,
      },
      {
        path: "projects/new",
        element: <NewProject />,
      },
      {
        path: "customers/:id",
        element: <CustomerDetails />,
      },
      {
        path: "customers/edit/:id",
        element: <EditCustomer />,
      },
      {
        path: "operators",
        element: <OperatorsPage />,
      },
      {
        path: "operators/new",
        element: <NewOperator />,
      },
      {
        path: "operators/edit/:id",
        element: <EditOperator />,
      },
    ],
  },
]);