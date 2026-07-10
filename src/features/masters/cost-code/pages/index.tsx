import {
    useMemo,
    useState,
  } from "react";
  
  import {
    MasterDrawer,
    MasterPageLayout,
  } from "@/components/master-data";
  
  import {
    useCostCodes,
  } from "../context";
  
  import type {
    CostCodeRecord,
  } from "../types";
  
  import CostCodeToolbar from "../components/CostCodeToolbar";
  import CostCodeTable from "../components/CostCodeTable";
  import CostCodeForm from "../components/CostCodeForm";
  
  export default function CostCodePage() {
  
    const {
  
      costCodes,
  
      create,
  
      update,
  
      softDelete,
  
    } = useCostCodes();
  
    const [
  
      keyword,
  
      setKeyword,
  
    ] = useState("");
  
    const [
  
      editing,
  
      setEditing,
  
    ] = useState<CostCodeRecord | null>(null);
  
    const [
  
      drawerOpen,
  
      setDrawerOpen,
  
    ] = useState(false);
  
    const filtered =
      useMemo(
  
        () =>
  
          costCodes.filter(
  
            item =>
  
              !item.deleted &&
  
              (
  
                item.code
                  .toLowerCase()
                  .includes(
                    keyword.toLowerCase()
                  )
  
                ||
  
                item.description
                  .toLowerCase()
                  .includes(
                    keyword.toLowerCase()
                  )
  
              )
  
          ),
  
        [
  
          costCodes,
  
          keyword,
  
        ]
  
      );
  
    function newRecord() {
  
      setEditing(null);
  
      setDrawerOpen(true);
  
    }
  
    function editRecord(
  
      record: CostCodeRecord
  
    ) {
  
      setEditing(record);
  
      setDrawerOpen(true);
  
    }
  
    function save(
  
      record: CostCodeRecord
  
    ) {
  
      if (editing) {
  
        update(record);
  
      } else {
  
        create(record);
  
      }
  
      setDrawerOpen(false);
  
      setEditing(null);
  
    }
  
    function closeDrawer() {
  
      setDrawerOpen(false);
  
      setEditing(null);
  
    }
  
    return (

      <>
    
        <MasterPageLayout
    
          title="Cost Codes"
    
          toolbar={
    
            <CostCodeToolbar
    
              keyword={keyword}
    
              onKeywordChange={setKeyword}
    
              onCreate={newRecord}
    
            />
    
          }
    
          form={null}
    
          table={
    
            <CostCodeTable
    
              records={filtered}
    
              onDelete={softDelete}
    
              onEdit={editRecord}
    
            />
    
          }
    
        />
    
        <MasterDrawer
    
          open={drawerOpen}
    
          title={
            editing
              ? "Edit Cost Code"
              : "New Cost Code"
          }
    
          onClose={closeDrawer}
    
        >
    
          <CostCodeForm
    
            editing={editing}
    
            onSave={save}
    
            onCancel={closeDrawer}
    
          />
    
        </MasterDrawer>
    
      </>
    
    );
  
  }