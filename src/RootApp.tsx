import { lazy, Suspense } from "react";
import { apiConfigPresent } from "./dataProvider";
import { BrandLogo } from "./portal/BrandLogo";

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
        <BrandLogo />
        <h1>Backend connection required</h1>
        <p>API configuration is missing. Restart the app.</p>
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
      <BrandLogo />
      <p>{label}</p>
    </main>
  );
}
