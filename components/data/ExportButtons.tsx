"use client";

import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildCsv, downloadCsv, timestampedFilename, type CsvColumn } from "@/lib/csv";
import { exportPdfTable, type PdfColumn } from "@/lib/pdf";

interface ExportButtonsProps<T> {
  rows: T[];
  columns: CsvColumn<T>[];
  /** Optional PDF-specific columns (defaults to CSV columns coerced to strings). */
  pdfColumns?: PdfColumn<T>[];
  /** Base filename (without extension). e.g. "virtual_machines". */
  filenameBase: string;
  /** Report title used in the PDF header. */
  title: string;
  /** Optional PDF subtitle. */
  subtitle?: string;
  disabled?: boolean;
}

export function ExportButtons<T>({
  rows,
  columns,
  pdfColumns,
  filenameBase,
  title,
  subtitle,
  disabled,
}: ExportButtonsProps<T>) {
  const onCsv = () => {
    downloadCsv(timestampedFilename(filenameBase, "csv"), buildCsv(rows, columns));
  };

  const onPdf = async () => {
    const cols: PdfColumn<T>[] =
      pdfColumns ??
      columns.map((c) => ({
        header: c.header,
        accessor: (row: T) => {
          const v = c.accessor(row);
          return v === null || v === undefined ? "" : String(v);
        },
      }));
    await exportPdfTable(rows, cols, {
      title,
      subtitle,
      filename: timestampedFilename(filenameBase, "pdf"),
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={onCsv}
        disabled={disabled || rows.length === 0}
      >
        <Download className="h-4 w-4" />
        CSV
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onPdf}
        disabled={disabled || rows.length === 0}
      >
        <FileText className="h-4 w-4" />
        PDF
      </Button>
    </div>
  );
}
