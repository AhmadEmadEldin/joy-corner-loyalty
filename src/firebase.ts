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

declare const __FIREBASE_OWNER_EMAILS__: string;

export type StaffRole = "barista" | "waiter" | "cashier" | "owner";

export type StaffProfile = {
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
export const db = app ? getFirestore(app) : null;

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

export async function signUpStaff(
  email: string,
  password: string,
  displayName: string,
  requestedRole: StaffRole = "waiter",
) {
  if (!auth) throw new Error("Firebase is not configured yet.");
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  return await ensureStaffProfile(credential.user, displayName, requestedRole, true);
}

export async function signOutStaff() {
  if (!auth) return;
  await signOut(auth);
}

async function ensureStaffProfile(
  user: User,
  displayName = "",
  requestedRole: StaffRole = "waiter",
  createMissing = false,
) {
  if (!db) throw new Error("Firestore is not configured yet.");

  const profileRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(profileRef);
  const email = user.email || "";

  if (snapshot.exists()) {
    const data = snapshot.data() as Partial<StaffProfile>;
    return {
      displayName: data.displayName || displayName || email,
      email: data.email || email,
      role: normalizeRole(data.role),
      uid: user.uid,
      ...data,
    };
  }

  const profile: StaffProfile = {
    displayName: displayName || email,
    email,
    role: initialRoleForEmail(email, requestedRole),
    uid: user.uid,
  };

  if (createMissing) {
    await setDoc(profileRef, {
      active: true,
      name: profile.displayName,
      ...profile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  return profile;
}

function initialRoleForEmail(email: string, requestedRole: StaffRole): StaffRole {
  const ownerEmails = __FIREBASE_OWNER_EMAILS__
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (ownerEmails.includes(email.toLowerCase())) return "owner";
  return requestedRole === "barista" || requestedRole === "cashier"
    ? requestedRole
    : "waiter";
}

function normalizeRole(role: unknown): StaffRole {
  return role === "barista" || role === "cashier" || role === "owner"
    ? role
    : "waiter";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
