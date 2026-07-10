import {
    useState,
  } from "react";
  
  import type {
    WorkspaceTab,
  } from "../types";
  
  let currentTab: WorkspaceTab =
    "overview";
  
  export function useWorkspaceTab() {
    const [tab] =
      useState(currentTab);
  
    return tab;
  }
  
  export function setWorkspaceTab(
    tab: WorkspaceTab
  ) {
    currentTab = tab;
  }