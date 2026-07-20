import { lazy, Suspense } from "react";
import { configuredDataProvider, supabaseConfigPresent } from "./dataProvider";

const LegacyApp = lazy(() =>
  import("./app").then((module) => ({ default: module.App })),
);
const CustomerPortal = lazy(() =>
  import("./supabase/CustomerPortal").then((module) => ({
    default: module.SupabaseCustomerPortal,
  })),
);
const StaffPortal = lazy(() =>
  import("./supabase/StaffPortal").then((module) => ({
    default: module.SupabaseStaffPortal,
  })),
);

export function RootApp() {
  if (configuredDataProvider === "legacy") {
    return (
      <Suspense fallback={<LoadingState label="Loading backup system…" />}>
        <LegacyApp />
      </Suspense>
    );
  }

  if (!supabaseConfigPresent) {
    return (
      <main className="supabase-portal center-state" role="alert">
        <img alt="Joy Corner" src="/assets/joy-corner-logo.svg" />
        <h1>Supabase connection required</h1>
        <p>
          Add <code>VITE_SUPABASE_URL</code> and{" "}
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>, then restart the app.
        </p>
      </main>
    );
  }

  const Portal = window.location.pathname.startsWith("/order")
    ? CustomerPortal
    : StaffPortal;

  return (
    <Suspense fallback={<LoadingState label="Connecting to Joy Corner…" />}>
      <Portal />
    </Suspense>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <main className="supabase-portal center-state" aria-busy="true">
      <img alt="Joy Corner" src="/assets/joy-corner-logo.svg" />
      <p>{label}</p>
    </main>
  );
}
