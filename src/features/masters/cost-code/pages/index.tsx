import {
  useMemo,
  useState,
} from "react";

import {
  MasterDrawer,
  MasterPageLayout,
} from "@/components/master-data";

import MasterImportWizard from "@/components/master-data/import-wizard/MasterImportWizard";

import {
  useCostCodes,
} from "../context";

import type {
  CostCodeRecord,
} from "../types";

import type {
  CostCodeImportRecord,
} from "../import/costCodeImportConfig";

import CostCodeToolbar from "../components/CostCodeToolbar";
import CostCodeTable from "../components/CostCodeTable";
import CostCodeForm from "../components/CostCodeForm";

import costCodeImportConfig from "../import/costCodeImportConfig";

import validateCostCode from "../import/validateCostCode";

import bulkCreateCostCodes from "../import/bulkCreateCostCodes";

import {
  exportToExcel,
} from "@/shared/import-export/excelExport";

import {
  exportToCsv,
} from "@/shared/import-export/csvExport";

import {
  generateTemplate,
} from "@/shared/import-export/templateGenerator";

export default function CostCodePage() {

  const {

    costCodes,

    create,

    update,

    softDelete,

    refresh,

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

  const [

    importOpen,

    setImportOpen,

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

    }

    else {

      create(record);

    }

    closeDrawer();

  }

  function closeDrawer() {

    setDrawerOpen(false);

    setEditing(null);

  }

  function exportExcel() {

    exportToExcel(

      filtered,

      {

        fileName:
          "Cost Codes",

        sheetName:
          "Cost Codes",

        columns: {

          code:
            "Cost Code",

          description:
            "Description",

          defaultRate:
            "Default Rate",

          unit:
            "Unit",

          active:
            "Active",

        },

      }

    );

  }

  function exportCsv() {

    exportToCsv(

      filtered,

      {

        fileName:
          "Cost Codes",

        columns: {

          code:
            "Cost Code",

          description:
            "Description",

          defaultRate:
            "Default Rate",

          unit:
            "Unit",

          active:
            "Active",

        },

      }

    );

  }

  function downloadTemplate() {

    generateTemplate(

      [

        {

          header: "Cost Code",

          required: true,

          sample: "1000",

          description:
            "Unique Cost Code",

        },

        {

          header: "Description",

          required: true,

          sample: "Equipment Rental",

          description:
            "Cost Code Description",

        },

        {

          header: "Active",

          required: false,

          sample: true,

          description:
            "TRUE or FALSE",

        },

      ],

      {

        fileName:
          "Cost Code Template",

      }

    );

  }

  function handleImport(

    records: CostCodeImportRecord[]

  ) {

    bulkCreateCostCodes(

      records

    );

  }

  function handleImportCompleted() {

    refresh();

    setImportOpen(false);

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

            onImport={() =>

              setImportOpen(true)

            }

            onExportExcel={

              exportExcel

            }

            onExportCsv={

              exportCsv

            }

            onDownloadTemplate={

              downloadTemplate

            }

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

      <MasterImportWizard<CostCodeImportRecord>

        open={importOpen}

        title="Import Cost Codes"

        columns={

          costCodeImportConfig.columns as any

        }

        validateRecord={(
          record,
          _rowNumber,
        ) =>

            validateCostCode(

              [record]

            ).errors

              .filter(

                error =>

                  error.row === 1

              )

              .map(

                error =>

                  error.message

              )

        }

        onImport={

          handleImport

        }

        onCompleted={

          handleImportCompleted

        }

        onClose={() =>

          setImportOpen(false)

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