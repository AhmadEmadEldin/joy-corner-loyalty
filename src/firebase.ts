import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import {
  User,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

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

export type CustomerProfile = {
  active?: boolean;
  createdAt?: unknown;
  displayName: string;
  email: string;
  phone?: string;
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
const firestore = app ? getFirestore(app) : null;

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

export function watchFirebaseUser(
  onChange: (user: User | null) => void,
  onError: (message: string) => void,
) {
  if (!auth) {
    onChange(null);
    return () => undefined;
  }

  return onAuthStateChanged(auth, onChange, (error) => onError(errorMessage(error)));
}

export async function signInCustomer(email: string, password: string) {
  if (!auth) throw new Error("Firebase is not configured yet.");
  const credential = await signInWithEmailAndPassword(auth, email, password);
  await ensureCustomerProfile(credential.user);
  return credential;
}

export async function signUpCustomer(
  email: string,
  password: string,
  displayName = "",
) {
  if (!auth) throw new Error("Firebase is not configured yet.");
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await createCustomerProfile(credential.user, displayName);
  return credential;
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
  const firestoreProfile = await staffProfileFromFirestore(user.uid, email);

  if (firestoreProfile) {
    return firestoreProfile;
  }

  throw new Error("No active Firestore staff profile found for this account.");
}

async function ensureCustomerProfile(user: User): Promise<CustomerProfile> {
  if (!firestore) throw new Error("Firestore is not configured yet.");
  const staffSnapshot = await getDoc(doc(firestore, "users", user.uid));

  if (staffSnapshot.exists()) {
    throw new Error("Staff accounts must use the staff sign-in page.");
  }

  const snapshot = await getDoc(doc(firestore, "customers", user.uid));
  if (!snapshot.exists()) {
    throw new Error("No customer profile found. Please sign up first.");
  }

  const profile = customerProfileFromData(user.uid, user.email || "", snapshot.data());
  if (!activeValue(profile.active)) {
    throw new Error("Customer account is inactive.");
  }

  return profile;
}

async function createCustomerProfile(user: User, displayName = "") {
  if (!firestore) throw new Error("Firestore is not configured yet.");
  const staffSnapshot = await getDoc(doc(firestore, "users", user.uid));

  if (staffSnapshot.exists()) {
    throw new Error("Staff accounts must use the staff sign-in page.");
  }

  const email = stringValue(user.email).toLowerCase();
  const profileRef = doc(firestore, "customers", user.uid);
  const snapshot = await getDoc(profileRef);
  await setDoc(
    profileRef,
    {
      active: true,
      ...(snapshot.exists() ? {} : { createdAt: serverTimestamp() }),
      displayName: stringValue(displayName || email),
      email,
      uid: user.uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

function customerProfileFromData(
  uid: string,
  signedInEmail: string,
  data: Record<string, unknown>,
): CustomerProfile {
  const email = stringValue(data.email || signedInEmail).toLowerCase();

  if (email && signedInEmail && email !== signedInEmail.toLowerCase()) {
    throw new Error("Customer profile email does not match this login.");
  }

  return {
    active: activeValue(data.active),
    displayName: stringValue(data.displayName || data.name || email),
    email,
    phone: stringValue(data.phone),
    uid,
  };
}

async function staffProfileFromFirestore(
  uid: string,
  email: string,
): Promise<StaffProfile | null> {
  if (!firestore) return null;

  const profile = await readStaffProfileDoc(uid, email);

  if (!profile) {
    throw new Error("No active Firestore staff profile found for this account.");
  }

  return profile;
}

async function readStaffProfileDoc(uid: string, signedInEmail: string) {
  const snapshot = await getDoc(doc(firestore!, "users", uid));
  if (!snapshot.exists()) return null;

  return staffProfileFromData(uid, signedInEmail, snapshot.data());
}

function staffProfileFromData(
  uid: string,
  signedInEmail: string,
  data: Record<string, unknown>,
): StaffProfile {
  const email = stringValue(data.email || signedInEmail).toLowerCase();
  const role = normalizeRole(data.role);

  if (!role) {
    throw new Error("Firestore staff profile has an invalid role.");
  }

  if (email && signedInEmail && email !== signedInEmail.toLowerCase()) {
    throw new Error("Firestore staff profile email does not match this login.");
  }

  if (!activeValue(data.active)) {
    throw new Error("Firestore staff account is inactive.");
  }

  return {
    active: true,
    displayName: stringValue(data.displayName || data.name || email),
    email,
    role,
    uid,
  };
}

function normalizeRole(value: unknown): StaffRole | null {
  const role = stringValue(value).toLowerCase();
  return role === "barista" ||
    role === "waiter" ||
    role === "cashier" ||
    role === "owner"
    ? role
    : null;
}

function activeValue(value: unknown) {
  if (value == null || value === "") return true;
  if (typeof value === "boolean") return value;

  const normalized = stringValue(value).toLowerCase();
  return !["no", "false", "disabled", "inactive", "blocked", "0"].includes(
    normalized,
  );
}

function stringValue(value: unknown) {
  return String(value ?? "").trim();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
