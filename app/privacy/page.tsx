import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Seller Automation Agent",
  description: "Privacy practices for the Seller Automation Agent sandbox integration."
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-ink-50 px-6 py-12 text-ink-900 dark:bg-ink-950 dark:text-white">
      <div className="mx-auto max-w-3xl">
        <Link href="/dashboard" className="text-sm font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300">
          Back to dashboard
        </Link>

        <div className="mt-8 rounded-lg border border-ink-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-sm font-semibold uppercase text-brand-700 dark:text-brand-300">Privacy Policy</p>
          <h1 className="mt-3 text-3xl font-semibold text-ink-950 dark:text-white">Seller Automation Agent</h1>
          <p className="mt-4 text-sm leading-6 text-ink-600 dark:text-ink-300">
            Seller Automation Agent is a seller automation dashboard that helps users test automation workflows with sandbox marketplace authorization. This page
            explains how the app handles account and automation data.
          </p>

          <section className="mt-8 space-y-5 text-sm leading-6 text-ink-700 dark:text-ink-200">
            <PrivacySection title="Authorization">
              The app uses eBay sandbox OAuth authorization to connect a user-approved sandbox eBay account. The app
              requests only the permissions needed to support automation features such as seller policy sync, inventory
              setup, listing draft preparation, and sandbox publishing.
            </PrivacySection>

            <PrivacySection title="Token Storage">
              OAuth access and refresh tokens are stored server-side and encrypted before they are saved. Tokens are used
              only to perform actions the user starts or configures inside the application.
            </PrivacySection>

            <PrivacySection title="Data Use">
              The app uses user, supplier, product, listing, Telegram, and eBay sandbox data only to provide automation
              features, generate listing drafts, analyze products, sync account settings, and publish approved sandbox
              listings.
            </PrivacySection>

            <PrivacySection title="No Sale of Data">
              The app does not sell user data. User data is not shared with advertisers or data brokers.
            </PrivacySection>

            <PrivacySection title="Security and Access">
              Credentials and integration tokens are handled on the server. Users should keep their own application
              credentials private and remove access from the eBay Developer portal if they no longer want the app to
              connect to their sandbox account.
            </PrivacySection>

            <PrivacySection title="Disconnecting Access">
              Users can disconnect eBay sandbox access from the app settings page. Disconnecting removes the stored
              OAuth tokens from active use in the application.
            </PrivacySection>

            <PrivacySection title="Contact">
              For privacy questions, contact the app owner at owner@example.com.
            </PrivacySection>
          </section>
        </div>
      </div>
    </main>
  );
}

function PrivacySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-semibold text-ink-950 dark:text-white">{title}</h2>
      <p className="mt-1">{children}</p>
    </section>
  );
}
