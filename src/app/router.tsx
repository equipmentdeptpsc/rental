import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter } from "react-router-dom";

import AppLayout from "./AppLayout";
import type { Permission } from "@/features/auth/domain/permission";
import AnonymousRoute from "@/features/auth/guards/AnonymousRoute";
import RequireAuthentication from "@/features/auth/guards/RequireAuthentication";
import RequirePermission from "@/features/auth/guards/RequirePermission";
import NotFound from "@/pages/NotFound";
import AccessDenied from "@/pages/AccessDenied";
import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
import { hasRecoveryCallback } from "@/features/auth/recovery";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CANONICAL_NAVIGATION_PERMISSIONS } from "./navigation/navigationConfig";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Equipment = lazy(() => import("@/pages/Equipment"));
const NewEquipment = lazy(() => import("@/pages/Equipment/New"));
const EditEquipment = lazy(() => import("@/pages/Equipment/Edit"));
const EquipmentDetails = lazy(() => import("@/pages/Equipment/Details"));
const EquipmentTrash = lazy(() => import("@/pages/Equipment/Trash"));
const CustomerPage = lazy(() => import("@/pages/Customers"));
const NewCustomer = lazy(() => import("@/pages/Customers/New"));
const CustomerDetails = lazy(() => import("@/pages/Customers/Details"));
const EditCustomer = lazy(() => import("@/pages/Customers/Edit"));
const Operators = lazy(() => import("@/pages/Operators"));
const NewOperator = lazy(() => import("@/pages/Operators/New"));
const EditOperator = lazy(() => import("@/pages/Operators/Edit"));
const Projects = lazy(() => import("@/pages/Projects"));
const NewProject = lazy(() => import("@/pages/Projects/New"));
const EditProject = lazy(() => import("@/pages/Projects/Edit"));
const Assignments = lazy(() => import("@/pages/Assignments"));
const NewAssignment = lazy(() => import("@/pages/Assignments/New"));
const AssignmentDetails = lazy(() => import("@/pages/Assignments/Details"));
const EditAssignment = lazy(() => import("@/pages/Assignments/Edit"));
const RentalPage = lazy(() => import("@/pages/Rental"));
const NewRental = lazy(() => import("@/pages/Rental/New"));
const ReturnRental = lazy(() => import("@/pages/Rental/Return"));
const RentalWorkspacePage = lazy(() => import("@/pages/RentalWorkspace"));
const RentalCommercialTermsPage = lazy(() => import("@/pages/Rental/CommercialTerms"));
const RentalCustomerContactPage = lazy(() => import("@/pages/Rental/CustomerContact"));
const OperatorDeurPage = lazy(() => import("@/pages/OperatorDeur"));
const OperatorLandingPage = lazy(() => import("@/pages/OperatorLanding"));
const RentalApprovalPage = lazy(() => import("@/pages/RentalApproval"));
const CustomerDeurReviewPage = lazy(() => import("@/pages/CustomerDeurReview"));
const GroupedCustomerReviewPage = lazy(() => import("@/pages/GroupedCustomerReview"));
const ManagerDeurReviewPage = lazy(() => import("@/pages/ManagerDeurReview"));
const ReviewCompletedPage = lazy(() => import("@/pages/ReviewCompleted"));
const MaintenancePage = lazy(() => import("@/pages/Maintenance"));
const NewMaintenance = lazy(() => import("@/pages/Maintenance/New"));
const MaintenanceDetails = lazy(() => import("@/pages/Maintenance/Details"));
const DailyLogs = lazy(() => import("@/pages/DailyLogs"));
const DailyLogNewRoute = lazy(() => import("@/pages/DailyLogs/NewRoute"));
const Billing = lazy(() => import("@/pages/Billing"));
const Reports = lazy(() => import("@/pages/Reports"));
const ReportPreview = lazy(() => import("@/pages/Reports/Preview"));
const Settings = lazy(() => import("@/pages/Settings"));
const DevelopmentEmailOutboxPage = lazy(() => import("@/pages/DevelopmentEmailOutbox"));
const DevelopmentEmailPreviewPage = lazy(() => import("@/pages/DevelopmentEmailOutbox/Preview"));
const DevelopmentCustomerReviewOutboxPage = lazy(() => import("@/pages/DevelopmentCustomerReviewOutbox"));
const DevelopmentCustomerReviewPreview = lazy(() => import("@/pages/DevelopmentCustomerReviewOutbox/Preview"));
const UsersPage = lazy(() => import("@/features/users/pages/UsersPage"));
const RolesPage = lazy(() => import("@/features/administration/pages/RolesPage"));
const PermissionsPage = lazy(() => import("@/features/administration/pages/PermissionsPage"));
const AuditTrailPage = lazy(() => import("@/features/administration/pages/AuditTrailPage"));
const DataMigrationPage = lazy(() => import("@/pages/DataMigration"));
const UatGroupedReviewCertification = lazy(() => import("@/pages/UatGroupedReviewCertification"));
const UatSingleBillingCertification = lazy(() => import("@/pages/UatSingleBillingCertification"));

const ActivityCodePage = lazy(() => import("@/features/masters/activity-code/pages"));
const CostCodePage = lazy(() => import("@/features/masters/cost-code/pages"));
const WorkDescriptionPage = lazy(() => import("@/features/masters/work-description/pages"));
const IdleReasonPage = lazy(() => import("@/features/masters/idle-reason/pages"));
const EquipmentSubcategoryPage = lazy(() => import("@/features/masters/equipment-subcategory/pages"));
const CertificationTypesPage = lazy(() => import("@/features/masters/certification-type/pages/CertificationTypesPage"));

function RecoveryRedirect({ children }: { children: ReactNode }) { const navigate=useNavigate(); useEffect(()=>{ if(hasRecoveryCallback()) navigate({ pathname: "/reset-password", search: window.location.search, hash: window.location.hash }, { replace: true }); },[navigate]); return <>{children}</>; }

function permitted(permission: Permission, element: ReactNode) {
  return <RequirePermission permission={permission}>{element}</RequirePermission>;
}

function routePage(element: ReactNode) {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500" role="status" aria-live="polite">Loading page…</div>}>
      {element}
    </Suspense>
  );
}

export const PUBLIC_ROUTE_PATTERNS = Object.freeze([
  "/login",
  "/rental-approval/:token",
  "/customer-deur-review/:deurId",
  "/review/deur/completed",
  "/review/manager/completed",
  "/review/deur/:credential",
  "/review/customer/grouped/:credential",
  "/review/manager/:credential",
]);

export const router = createBrowserRouter([
  { path: "/login", element: <AnonymousRoute><Login /></AnonymousRoute> },
  { path: "/rental-approval/:token", element: routePage(<RentalApprovalPage />) },
  { path: "/customer-deur-review/:deurId", element: routePage(<CustomerDeurReviewPage />) },
  { path: "/review/deur/completed", element: routePage(<ReviewCompletedPage audience="customer" />) },
  { path: "/review/manager/completed", element: routePage(<ReviewCompletedPage audience="manager" />) },
  { path: "/review/deur/:credential", element: routePage(<CustomerDeurReviewPage />) },
  { path: "/review/customer/grouped/:credential", element: routePage(<GroupedCustomerReviewPage />) },
  { path: "/review/manager/:credential", element: routePage(<ManagerDeurReviewPage />) },
  {
    path: "/",
    element: <RecoveryRedirect><RequireAuthentication><AppLayout /></RequireAuthentication></RecoveryRedirect>,
    errorElement: <NotFound />,
    children: [
      { index: true, element: permitted("dashboard.read", routePage(<Dashboard />)) },
      { path: "dashboard", element: permitted("dashboard.read", routePage(<Dashboard />)) },
      { path: "access-denied", element: <AccessDenied /> },
      { path: "equipment", element: permitted("equipment.read", routePage(<Equipment />)) },
      { path: "equipment/new", element: permitted("equipment.create", routePage(<NewEquipment />)) },
      { path: "equipment/edit/:id", element: permitted("equipment.update", routePage(<EditEquipment />)) },
      { path: "equipment/trash", element: permitted("equipment.restore", routePage(<EquipmentTrash />)) },
      { path: "equipment/:id", element: permitted("equipment.read", routePage(<EquipmentDetails />)) },
      { path: "customers", element: permitted("customer.read", routePage(<CustomerPage />)) },
      { path: "customers/new", element: permitted("customer.create", routePage(<NewCustomer />)) },
      { path: "customers/:id", element: permitted("customer.read", routePage(<CustomerDetails />)) },
      { path: "customers/edit/:id", element: permitted("customer.manage", routePage(<EditCustomer />)) },
      { path: "operators", element: permitted("operator.read", routePage(<Operators />)) },
      { path: "operators/new", element: permitted("operator.create", routePage(<NewOperator />)) },
      { path: "operators/edit/:id", element: permitted("operator.read", routePage(<EditOperator />)) },
      { path: "projects", element: permitted("project.read", routePage(<Projects />)) },
      { path: "projects/new", element: permitted("project.create", routePage(<NewProject />)) },
      { path: "projects/:id/edit", element: permitted("project.manage", routePage(<EditProject />)) },
      { path: "projects/:id/customer", element: permitted("project.update", routePage(<EditProject />)) },
      { path: "assignments", element: permitted("assignment.read", routePage(<Assignments />)) },
      { path: "assignments/new", element: permitted("assignment.create", routePage(<NewAssignment />)) },
      { path: "assignments/:id/edit", element: permitted("assignment.manage", routePage(<EditAssignment />)) },
      { path: "assignments/:id", element: permitted("assignment.read", routePage(<AssignmentDetails />)) },
      { path: "rentals", element: permitted("rental.read", routePage(<RentalPage />)) },
      { path: "rentals/new", element: permitted("rental.create", routePage(<NewRental />)) },
      { path: "rentals/:rentalId/workspace", element: permitted("rental.read", routePage(<RentalWorkspacePage />)) },
      { path: "rentals/:rentalId/commercial-terms", element: permitted("rental.commercialTerms.read", routePage(<RentalCommercialTermsPage />)) },
      { path: "rentals/:rentalId/customer-contact", element: permitted("rental.customerContact.update", routePage(<RentalCustomerContactPage />)) },
      { path: "rentals/:rentalId/operator-deur", element: permitted("deur.read", routePage(<OperatorDeurPage />)) },
      { path: "operator", element: permitted("deur.read", routePage(<OperatorLandingPage />)) },
      { path: "rentals/return/:id", element: permitted("rental.return", routePage(<ReturnRental />)) },
      { path: "maintenance", element: permitted("maintenance.read", routePage(<MaintenancePage />)) },
      { path: "maintenance/new", element: permitted("maintenance.manage", routePage(<NewMaintenance />)) },
      { path: "maintenance/:id", element: permitted("maintenance.read", routePage(<MaintenanceDetails />)) },
      { path: "daily-logs", element: permitted("dailyLog.read", routePage(<DailyLogs />)) },
      { path: "daily-logs/new", element: permitted("dailyLog.manage", routePage(<DailyLogNewRoute />)) },
      { path: "billing", element: permitted("billing.read", routePage(<Billing />)) },
      { path: "reports", element: permitted(CANONICAL_NAVIGATION_PERMISSIONS.reports, routePage(<Reports />)) },
      { path: "reports/preview", element: permitted(CANONICAL_NAVIGATION_PERMISSIONS.reports, routePage(<ReportPreview />)) },
      { path: "settings", element: permitted(CANONICAL_NAVIGATION_PERMISSIONS.settings, routePage(<Settings />)) },
      { path: "users", element: permitted(CANONICAL_NAVIGATION_PERMISSIONS.users, routePage(<UsersPage />)) },
      { path: "roles", element: permitted(CANONICAL_NAVIGATION_PERMISSIONS.roles, routePage(<RolesPage />)) },
      { path: "permissions", element: permitted(CANONICAL_NAVIGATION_PERMISSIONS.permissions, routePage(<PermissionsPage />)) },
      { path: "audit-trail", element: permitted(CANONICAL_NAVIGATION_PERMISSIONS.auditTrail, routePage(<AuditTrailPage />)) },
      { path: "data-migration", element: permitted(CANONICAL_NAVIGATION_PERMISSIONS.dataMigration, routePage(<DataMigrationPage />)) },
      { path: "uat/grouped-review-certification", element: permitted("settings.update", routePage(<UatGroupedReviewCertification />)) },
      { path: "uat/single-billing-certification", element: permitted("settings.update", routePage(<UatSingleBillingCertification />)) },
      { path: "development-email-outbox", element: permitted("settings.manage", routePage(<DevelopmentEmailOutboxPage />)) },
      { path: "development-email-outbox/:id", element: permitted("settings.manage", routePage(<DevelopmentEmailPreviewPage />)) },
      { path: "development-customer-review-outbox", element: permitted("settings.manage", routePage(<DevelopmentCustomerReviewOutboxPage />)) },
      { path: "development-customer-review-outbox/:id", element: permitted("settings.manage", routePage(<DevelopmentCustomerReviewPreview />)) },
      {
        path: "settings/activity-codes",
        element: permitted("masterData.manage", routePage(<ActivityCodePage />)),
      },
      { path: "settings/cost-codes", element: permitted("masterData.manage", routePage(<CostCodePage />)) },
      {
        path: "settings/work-descriptions",
        element: permitted("masterData.manage", routePage(<WorkDescriptionPage />)),
      },
      { path: "settings/idle-reasons", element: permitted("masterData.manage", routePage(<IdleReasonPage />)) },
      { path: "settings/equipment-subcategories", element: permitted("masterData.read", routePage(<EquipmentSubcategoryPage />)) },
      { path: "settings/certification-types", element: permitted("masterData.read", routePage(<CertificationTypesPage />)) },
    ],
  },
  { path: "/reset-password", element: <ResetPassword /> },
]);
