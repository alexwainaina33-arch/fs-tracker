// src/store/auth.js
// Extends login to fetch + cache org_id from ft_org_members
// user.org_id is now available everywhere in the app

import { create } from "zustand";
import { pb } from "../lib/pb";

// Fetch the user's org_id from ft_org_members and return it
// Returns null if not found (shouldn't happen for valid users)
async function fetchOrgId(userId) {
  try {
    const member = await pb.collection("ft_org_members").getFirstListItem(
      `user_id = "${userId}" && is_active = true`
    );
    return member.org_id ?? null;
  } catch {
    // Try without is_active filter in case it's not set
    try {
      const member = await pb.collection("ft_org_members").getFirstListItem(
        `user_id = "${userId}"`
      );
      return member.org_id ?? null;
    } catch {
      return null;
    }
  }
}

// Hydrate org_id onto an existing user record from the auth store
async function hydrateUser(record) {
  if (!record) return null;
  // Already has org_id (e.g. from a previous hydration stored in token)
  if (record.org_id) return record;
  const org_id = await fetchOrgId(record.id);
  return { ...record, org_id };
}

export const useAuth = create((set, get) => {
  // Hydrate on page load from existing auth store
  const rawRecord = pb.authStore.record ?? pb.authStore.model;
  if (rawRecord && pb.authStore.isValid) {
    hydrateUser(rawRecord).then((user) => {
      set({ user, isAuth: pb.authStore.isValid });
    });
  }

  // Keep zustand in sync when PocketBase auth changes
  pb.authStore.onChange((token, record) => {
    if (record && pb.authStore.isValid) {
      hydrateUser(record).then((user) => {
        set({ user, token, isAuth: pb.authStore.isValid });
      });
    } else {
      set({ user: record, token, isAuth: pb.authStore.isValid });
    }
  }, true);

  return {
    user:   rawRecord ? { ...rawRecord } : null,
    token:  pb.authStore.token,
    isAuth: pb.authStore.isValid,

    login: async (email, password) => {
      const auth = await pb.collection("ft_users").authWithPassword(email, password);
      // Fetch org_id immediately after login
      const org_id = await fetchOrgId(auth.record.id);
      const user = { ...auth.record, org_id };
      set({ user, token: auth.token, isAuth: true });
      return user;
    },

    logout: () => {
      pb.authStore.clear();
      set({ user: null, token: null, isAuth: false });
    },

    update: (data) => set({ user: { ...get().user, ...data } }),

    isAdmin:      () => ["admin", "manager"].includes(get().user?.role),
    isSupervisor: () => ["admin", "manager", "supervisor"].includes(get().user?.role),
    isField:      () => get().user?.role === "field_staff",
  };
});