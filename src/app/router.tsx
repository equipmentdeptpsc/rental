import { createBrowserRouter } from "react-router-dom";

import AppLayout from "./AppLayout";

import Dashboard from "@/pages/Dashboard";

import Equipment from "@/pages/Equipment";

import Operators from "@/pages/Operators";

import Projects from "@/pages/Projects";

import Billing from "@/pages/Billing";

import Reports from "@/pages/Reports";

import Bookings from "@/pages/Bookings";

import DailyLogs from "@/pages/DailyLogs";

import Settings from "@/pages/Settings";

import NotFound from "@/pages/NotFound";

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
    ],
  },
]);