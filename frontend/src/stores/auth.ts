import { defineStore } from "pinia";
import { ref, computed, onUnmounted } from "vue";
import axios from "axios";

export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export interface Session {
  sessionId: string;
  token: string;
  expiresAt: Date;
  isAnonymous: boolean;
}

export const useAuthStore = defineStore("auth", () => {
  const user = ref<User | null>(null);
  const token = ref<string | null>(localStorage.getItem("auth_token") || localStorage.getItem("session_token"));
  const sessionData = ref<Session | null>(null);
  const isAuthenticated = computed(() => !!user.value);
  const hasSession = computed(() => !!token.value);
  const isAnonymous = computed(() => hasSession.value && !isAuthenticated.value);

let refreshTimer: ReturnType<typeof setInterval> | null = null;
  const REFRESH_INTERVAL = 30 * 1000; // 30 seconds in milliseconds

  if (token.value) {
    axios.defaults.headers.common["Authorization"] = `Bearer ${token.value}`;
  }

  const setAuth = (authToken: string, userData: User) => {
    token.value = authToken;
    user.value = userData;
    sessionData.value = null;
    localStorage.setItem("auth_token", authToken);
    localStorage.removeItem("session_token");
    axios.defaults.headers.common["Authorization"] = `Bearer ${authToken}`;

    startPeriodicRefresh();
  };

  const setSession = (session: Session) => {
    token.value = session.token;
    sessionData.value = session;
    user.value = null;
    localStorage.setItem("session_token", session.token);
    localStorage.removeItem("auth_token");
    axios.defaults.headers.common["Authorization"] = `Bearer ${session.token}`;
  };

  const clearAuth = () => {
    token.value = null;
    user.value = null;
    sessionData.value = null;
    localStorage.removeItem("auth_token");
    localStorage.removeItem("session_token");
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

  const createAnonymousSession = async () => {
    try {
      const response = await axios.post("/api/auth/session");
      const session: Session = {
        sessionId: response.data.sessionId,
        token: response.data.token,
        expiresAt: new Date(response.data.expiresAt),
        isAnonymous: true
      };
      setSession(session);
      return session;
    } catch (error) {
      console.error("Failed to create anonymous session:", error);
      throw error;
    }
  };

  const claimSession = async () => {
    if (!sessionData.value) {
      throw new Error("No anonymous session to claim");
    }
    
    try {
      await axios.post("/api/auth/claim", {
        sessionId: sessionData.value.sessionId
      });
      
      // After claiming, the user should authenticate to get the full benefits
      return true;
    } catch (error) {
      console.error("Failed to claim session:", error);
      throw error;
    }
  };

  const ensureSession = async () => {
    if (!hasSession.value) {
      await createAnonymousSession();
    }
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
    sessionData,
    isAuthenticated,
    hasSession,
    isAnonymous,
    setAuth,
    setSession,
    clearAuth,
    fetchUser,
    createAnonymousSession,
    claimSession,
    ensureSession,
    login,
    logout,
    startPeriodicRefresh,
    stopPeriodicRefresh,
  };
});
