export interface CsvExportOptions<T> {

    /**
     * Output filename
     */
  
    fileName: string;
  
    /**
     * Optional column mapping
     */
  
    columns?: Partial<
      Record<
        keyof T,
        string
      >
    >;
  
  }
  
  export function exportToCsv<T extends Record<string, unknown>>(
  
    records: T[],
  
    options: CsvExportOptions<T>
  
  ): void {
  
    const {
  
      fileName,
  
      columns,
  
    } = options;
  
    if (records.length === 0) {
  
      alert(
  
        "There is no data to export."
  
      );
  
      return;
  
    }
  
    let headers: string[] = [];
  
    let keys: string[] = [];
  
    if (columns) {
  
      keys = Object.keys(columns);
  
      headers = Object.values(columns).map(
  
        value => value ?? ""
  
      );
  
    }
  
    else {
  
      keys = Object.keys(records[0]);
  
      headers = [...keys];
  
    }
  
    const csvRows: string[] = [];
  
    csvRows.push(
  
      headers.join(",")
  
    );
  
    records.forEach(record => {
  
      const values = keys.map(key => {
  
        const value = record[key];
  
        if (
  
          value === null ||
  
          value === undefined
  
        ) {
  
          return "";
  
        }
  
        const text =
  
          String(value)
  
            .replace(/"/g, "\"\"");
  
        return `"${text}"`;
  
      });
  
      csvRows.push(
  
        values.join(",")
  
      );
  
    });
  
    const csvContent =
  
      csvRows.join("\r\n");
  
    const blob = new Blob(
  
      [
  
        "\uFEFF",
  
        csvContent,
  
      ],
  
      {
  
        type: "text/csv;charset=utf-8;",
  
      }
  
    );
  
    const url =
  
      URL.createObjectURL(blob);
  
    const link =
  
      document.createElement("a");
  
    link.href = url;
  
    link.download =
  
      `${fileName}.csv`;
  
    document.body.appendChild(
  
      link
  
    );
  
    link.click();
  
    document.body.removeChild(
  
      link
  
    );
  
    URL.revokeObjectURL(
  
      url
  
    );
  
  }