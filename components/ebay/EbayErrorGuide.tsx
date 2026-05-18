import { AlertTriangle } from "lucide-react";

const errorMessages = [
  {
    title: "Missing policy IDs",
    message: "Sync seller policies in Settings. eBay requires payment, return, and fulfillment policies."
  },
  {
    title: "Missing inventory location",
    message: "Create a warehouse inventory location before publishing an offer."
  },
  {
    title: "Expired token",
    message: "The system refreshes tokens automatically; reconnect eBay if the refresh token is expired."
  },
  {
    title: "Invalid category",
    message: "Add a valid eBay sandbox category ID to the listing draft before publishing."
  },
  {
    title: "Invalid aspects",
    message: "Review item specifics for the selected category and remove empty values."
  },
  {
    title: "Duplicate SKU",
    message: "Use a unique SKU or revise the existing sandbox inventory item."
  },
  {
    title: "Image error",
    message: "Use at least one eBay-accessible optimized image URL."
  }
];

export function EbayErrorGuide() {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
      <div className="flex items-center gap-2">
        <AlertTriangle size={18} />
        <h3 className="font-semibold">Sandbox publish error guide</h3>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {errorMessages.map((item) => (
          <div key={item.title} className="rounded-md bg-white/70 p-3 dark:bg-white/[0.06]">
            <p className="text-sm font-semibold">{item.title}</p>
            <p className="mt-1 text-xs leading-5">{item.message}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
