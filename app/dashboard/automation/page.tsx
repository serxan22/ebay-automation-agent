import { SettingsSection } from "@/components/settings/SettingsSection";
import { demoSettings } from "@/lib/demo-data";

export default function AutomationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink-950 dark:text-white">Automation rules</h2>
        <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
          Saved rules used by the dashboard, agent tasks, and Telegram parser.
        </p>
      </div>

      <SettingsSection title="Listing controls" description="Manual approval remains the Phase 1 default.">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Auto listing" value={demoSettings.autoListingEnabled ? "Enabled" : "Disabled"} />
          <Field label="Approval mode" value={demoSettings.approvalMode.replace("_", " ")} />
          <Field label="Daily listing limit" value={String(demoSettings.dailyListingLimit)} />
          <Field label="Minimum margin" value={`${demoSettings.minMarginPercentage}%`} />
          <Field label="Minimum profit" value={`$${demoSettings.minProfitAmount}`} />
          <Field label="Risk tolerance" value={`${demoSettings.riskTolerance}/100`} />
        </div>
      </SettingsSection>

      <SettingsSection title="Compliance filters" description="Blocked categories and brands are enforced before draft creation.">
        <div className="grid gap-4 md:grid-cols-2">
          <ListField label="Allowed categories" values={demoSettings.allowedCategories} />
          <ListField label="Blocked categories" values={demoSettings.blockedCategories} />
          <ListField label="Blocked brands" values={demoSettings.blockedBrands} />
          <ListField label="Blocked keywords" values={demoSettings.blockedKeywords} />
        </div>
      </SettingsSection>

      <SettingsSection title="Inventory and shipping" description="Supplier stock and delivery promises must be clear.">
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Max shipping days" value={String(demoSettings.maxShippingDays)} />
          <Field label="Shipping country" value={demoSettings.shippingCountryPreference} />
          <Field label="Minimum stock" value={String(demoSettings.minStockQuantity)} />
          <Field label="Default quantity" value={String(demoSettings.defaultQuantity)} />
        </div>
      </SettingsSection>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="text-sm font-medium text-ink-700 dark:text-ink-200">
      {label}
      <input
        className="mt-2 h-10 w-full rounded-md border border-ink-200 bg-ink-50 px-3 text-sm text-ink-900 dark:border-white/10 dark:bg-ink-950 dark:text-white"
        defaultValue={value}
      />
    </label>
  );
}

function ListField({ label, values }: { label: string; values: string[] }) {
  return (
    <label className="text-sm font-medium text-ink-700 dark:text-ink-200">
      {label}
      <textarea
        className="mt-2 min-h-28 w-full rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-900 dark:border-white/10 dark:bg-ink-950 dark:text-white"
        defaultValue={values.join(", ")}
      />
    </label>
  );
}
