import { defineStore } from "pinia";
import { ref, computed, onUnmounted } from "vue";
import axios from "axios";

export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export const useAuthStore = defineStore("auth", () => {
  const user = ref<User | null>(null);
  const token = ref<string | null>(localStorage.getItem("auth_token"));
  const isAuthenticated = computed(() => !!user.value && !!token.value);

let refreshTimer: ReturnType<typeof setInterval> | null = null;
  const REFRESH_INTERVAL = 30 * 1000; // 30 seconds in milliseconds

  if (token.value) {
    axios.defaults.headers.common["Authorization"] = `Bearer ${token.value}`;
  }

  const setAuth = (authToken: string, userData: User) => {
    token.value = authToken;
    user.value = userData;
    localStorage.setItem("auth_token", authToken);
    axios.defaults.headers.common["Authorization"] = `Bearer ${authToken}`;

    startPeriodicRefresh();
  };

  const clearAuth = () => {
    token.value = null;
    user.value = null;
    localStorage.removeItem("auth_token");
    delete axios.defaults.headers.common["Authorization"];

    stopPeriodicRefresh();
  };

  const fetchUser = async (silent = false) => {
    if (!token.value) return false;

    try {
      const response = await axios.get("/api/auth/me");

      const newUserData = response.data.user;
      if (
        !user.value ||
        JSON.stringify(user.value) !== JSON.stringify(newUserData)
      ) {
        user.value = newUserData;

        if (user.value?.picture) {
          const url = new URL(user.value.picture);
          url.searchParams.set("t", Date.now().toString());
          user.value.picture = url.toString();
        }
      }

      return true;
    } catch (error) {
      if (!silent) {
        console.error("Failed to fetch user:", error);
      }
      // Only clear auth on actual auth errors, not network issues
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        clearAuth();
      }
      return false;
    }
  };

  const startPeriodicRefresh = () => {
    stopPeriodicRefresh();

    if (isAuthenticated.value) {
      refreshTimer = setInterval(() => {
        fetchUser(true);
      }, REFRESH_INTERVAL);
    }
  };

  const stopPeriodicRefresh = () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  };

  const login = () => {
    window.location.href = "/api/auth/google";
  };

  const logout = async () => {
    try {
      await axios.post("/api/auth/logout");
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      clearAuth();
    }
  };

  if (token.value) {
    fetchUser().then((success) => {
      if (success) {
        startPeriodicRefresh();
      }
    });
  }

  onUnmounted(() => {
    stopPeriodicRefresh();
  });

  const handleVisibilityChange = () => {
    if (document.hidden) {
      stopPeriodicRefresh();
    } else if (isAuthenticated.value) {
      fetchUser(true);
      startPeriodicRefresh();
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  return {
    user,
    token,
    isAuthenticated,
    setAuth,
    clearAuth,
    fetchUser,
    login,
    logout,
    startPeriodicRefresh,
    stopPeriodicRefresh,
  };
});
