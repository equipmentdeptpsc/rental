export interface CsvExportOptions<T> {

  fileName: string;

  columns?: Partial<
    Record<
      keyof T,
      string
    >
  >;

}

export function exportToCsv<T>(

  records: T[],

  options: CsvExportOptions<T>

): void {

  const {

    fileName,

    columns,

  } = options;

  if (records.length === 0) {

    alert("There is no data to export.");

    return;

  }

  let headers: string[] = [];

  let keys: string[] = [];

  if (columns) {

    const columnEntries =
      Object.entries(columns) as Array<
        [keyof T, string]
      >;

    keys = columnEntries.map(

      ([key]) => String(key)

    );

    headers = columnEntries.map(

      ([, label]) => label

    );

  }

  else {

    keys = Object.keys(

      records[0] as object

    );

    headers = [...keys];

  }

  const csvRows: string[] = [];

  csvRows.push(

    headers.join(",")

  );

  records.forEach(record => {

    const source =
      record as Record<string, unknown>;

    const values = keys.map(key => {

      const value = source[key];

      if (

        value === null ||

        value === undefined

      ) {

        return "";

      }

      const escaped =

        String(value)

          .replace(/"/g, "\"\"");

      return `"${escaped}"`;

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

      type:

        "text/csv;charset=utf-8;",

    }

  );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;

  link.download =
    `${fileName}.csv`;

  document.body.appendChild(link);

  link.click();

  document.body.removeChild(link);

  URL.revokeObjectURL(url);

}