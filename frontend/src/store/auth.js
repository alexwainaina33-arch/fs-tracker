import { create } from "zustand";
import { pb } from "../lib/pb";

export const useAuth = create((set, get) => {
  // Keep zustand in sync whenever PocketBase auth changes (refresh, expiry, login)
  pb.authStore.onChange((token, record) => {
    set({ user: record, token, isAuth: pb.authStore.isValid });
  }, true); // true = fire immediately to hydrate on page load

  return {
    user:   pb.authStore.record ?? pb.authStore.model,
    token:  pb.authStore.token,
    isAuth: pb.authStore.isValid,

    login: async (email, password) => {
      const auth = await pb.collection("ft_users").authWithPassword(email, password);
      set({ user: auth.record, token: auth.token, isAuth: true });
      return auth.record;
    },

    logout: () => {
      pb.authStore.clear();
      set({ user: null, token: null, isAuth: false });
    },

    update: (data) => set({ user: { ...get().user, ...data } }),

    isAdmin:      () => ["admin","manager"].includes(get().user?.role),
    isSupervisor: () => ["admin","manager","supervisor"].includes(get().user?.role),
    isField:      () => get().user?.role === "field_staff",
  };
});
