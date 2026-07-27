export interface OrganizationBranding {
  companyName: string;
  departmentName: string;
  systemName: string;
  logoAssetPath: string;
  logoAltText: string;
  documentFooter: string;
}

export const organizationBranding: Readonly<OrganizationBranding> = Object.freeze({
  companyName: "Primary Structures Corporation",
  departmentName: "Equipment Department",
  systemName: "Equipment Rental Management System",
  logoAssetPath: "/branding/primary-structures-corporation-logo.png",
  logoAltText: "Primary Structures Corporation logo",
  documentFooter: "Primary Structures Corporation - Equipment Department",
});
