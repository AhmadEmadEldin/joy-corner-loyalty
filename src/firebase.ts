import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import {
  User,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

declare const __FIREBASE_CONFIG__: {
  apiKey: string;
  appId: string;
  authDomain: string;
  measurementId?: string;
  messagingSenderId: string;
  projectId: string;
  storageBucket: string;
};

export type StaffRole = "barista" | "waiter" | "cashier" | "owner";

export type StaffProfile = {
  active?: boolean;
  createdAt?: unknown;
  displayName: string;
  email: string;
  role: StaffRole;
  uid: string;
  updatedAt?: unknown;
};

const requiredFirebaseKeys: Array<keyof typeof __FIREBASE_CONFIG__> = [
  "apiKey",
  "appId",
  "authDomain",
  "projectId",
];

export const firebaseReady = requiredFirebaseKeys.every(
  (key) => Boolean(__FIREBASE_CONFIG__[key]),
);

const app = firebaseReady ? initializeApp(__FIREBASE_CONFIG__) : null;

export const auth = app ? getAuth(app) : null;

if (app) {
  void isSupported().then((supported) => {
    if (supported) {
      getAnalytics(app);
    }
  });
}

export default app;

export function watchStaffAuth(
  onChange: (session: { profile: StaffProfile; user: User } | null) => void,
  onError: (message: string) => void,
) {
  if (!auth) {
    onChange(null);
    return () => undefined;
  }

  return onAuthStateChanged(auth, async (user) => {
    try {
      onChange(user ? { profile: await ensureStaffProfile(user), user } : null);
    } catch (error) {
      onError(errorMessage(error));
      onChange(null);
    }
  });
}

export async function signInStaff(email: string, password: string) {
  if (!auth) throw new Error("Firebase is not configured yet.");
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return await ensureStaffProfile(credential.user);
}

export async function signOutStaff() {
  if (!auth) return;
  await signOut(auth);
}

async function ensureStaffProfile(
  user: User,
  displayName = "",
): Promise<StaffProfile> {
  const email = user.email || "";
  return {
    active: true,
    displayName: displayName || email,
    email,
    role: "barista",
    uid: user.uid,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
