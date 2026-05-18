"use client";

import { type FormEvent, useMemo, useState } from "react";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { defaultCsvMapping, type CsvImportMapping } from "@/lib/suppliers/csv-import";

export function SupplierCsvImporter() {
  const [mapping, setMapping] = useState<CsvImportMapping>(defaultCsvMapping);
  const [message, setMessage] = useState<string>("");
  const fields = useMemo(() => Object.keys(defaultCsvMapping) as Array<keyof CsvImportMapping>, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Importing CSV preview...");
    const formData = new FormData(event.currentTarget);
    formData.set("mapping", JSON.stringify(mapping));

    const response = await fetch("/api/suppliers/import", {
      method: "POST",
      body: formData
    });
    const payload = (await response.json()) as { message?: string; error?: string };
    setMessage(payload.message ?? payload.error ?? "Import finished.");
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-ink-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-ink-950 dark:text-white">CSV supplier import</h3>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            Upload approved supplier feeds and map custom columns before saving products.
          </p>
        </div>
        <Button>
          <UploadCloud size={16} /> Import CSV
        </Button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <label className="text-sm font-medium text-ink-700 dark:text-ink-200">
          Supplier name
          <input
            name="supplierName"
            className="mt-2 h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-ink-950"
            defaultValue="NorthStar Wholesale CSV"
          />
        </label>
        <label className="text-sm font-medium text-ink-700 dark:text-ink-200">
          Supplier ID
          <input
            name="supplierId"
            className="mt-2 h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-ink-950"
            defaultValue="new"
          />
        </label>
        <label className="text-sm font-medium text-ink-700 dark:text-ink-200">
          CSV file
          <input
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="mt-2 block h-10 w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-950"
          />
        </label>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {fields.map((field) => (
          <label key={field} className="text-xs font-medium text-ink-500 dark:text-ink-400">
            {field}
            <input
              value={mapping[field] ?? ""}
              onChange={(event) =>
                setMapping((current) => ({
                  ...current,
                  [field]: event.target.value
                }))
              }
              className="mt-2 h-9 w-full rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-900 dark:border-white/10 dark:bg-ink-950 dark:text-white"
            />
          </label>
        ))}
      </div>

      {message ? <p className="mt-4 text-sm text-ink-600 dark:text-ink-300">{message}</p> : null}
    </form>
  );
}
