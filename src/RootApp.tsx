import { lazy, Suspense } from "react";
import { apiConfigPresent } from "./dataProvider";

const CustomerPortal = lazy(() =>
  import("./portal/CustomerPortal").then((module) => ({
    default: module.CustomerPortal,
  })),
);
const StaffPortal = lazy(() =>
  import("./portal/StaffPortal").then((module) => ({
    default: module.StaffPortal,
  })),
);

export function RootApp() {
  if (!apiConfigPresent) {
    return (
      <main className="joy-portal center-state" role="alert">
        <img alt="Joy Corner" src="/assets/joy-corner-logo.svg" />
        <h1>Backend connection required</h1>
        <p>Add <code>VITE_API_URL</code>, then restart the app.</p>
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
    <main className="joy-portal center-state" aria-busy="true">
      <img alt="Joy Corner" src="/assets/joy-corner-logo.svg" />
      <p>{label}</p>
    </main>
  );
}
