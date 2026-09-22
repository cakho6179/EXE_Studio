import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, getStoredUser, isTokenExpired } from '../services/api.js';

const AuthContext = createContext(null);

// Key localStorage theo user — phải xóa khi đổi tài khoản, nếu không user mới thấy data cache của user cũ.
const USER_SCOPED_KEYS = [
  'studi_onboarded',
  'studi_pending_auth',
  'studi_verify_email',
  'studi_recovery_email',
  'studi_demo_otp',
  'studi_otp_sent_at',
  'studi_task_draft',
];

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [user, setUser] = useState(() => getStoredUser());
  const [ready, setReady] = useState(false);

  const clearUserData = useCallback(() => {
    try {
      qc.clear(); // Xóa toàn bộ cache React Query (tasks/timeline/pulse...) của user cũ
      USER_SCOPED_KEYS.forEach((k) => localStorage.removeItem(k));
      // Key động theo user (yêu thích âm thanh...)
      Object.keys(localStorage).filter((k) => k.startsWith('studi_sound_favs:')).forEach((k) => localStorage.removeItem(k));
      sessionStorage.removeItem('studi_pending_auth');
      sessionStorage.removeItem('studi_verify_email');
      sessionStorage.removeItem('studi_demo_otp');
    } catch {
      /* bỏ qua */
    }
  }, [qc]);

  const saveUser = useCallback((u) => {
    setUser(u);
    try {
      if (u) localStorage.setItem('studi_user', JSON.stringify(u));
      else localStorage.removeItem('studi_user');
    } catch {
      /* bỏ qua */
    }
  }, []);

  const logout = useCallback(
    async (redirect = true) => {
      const rfToken = api.getRefreshToken();
      try {
        await api.post('/auth/logout', { refresh_token: rfToken }).catch(() => {});
      } catch {
        /* Bỏ qua lỗi network khi logout */
      } finally {
        api.removeToken();
        clearUserData();
        saveUser(null);
        if (redirect) navigate('/login', { replace: true });
      }
    },
    [navigate, saveUser, clearUserData],
  );

  // Hết phiên ở bất kỳ request nào -> đăng xuất + về login
  useEffect(() => {
    const onUnauthorized = () => logout(true);
    window.addEventListener('studi:unauthorized', onUnauthorized);
    return () => window.removeEventListener('studi:unauthorized', onUnauthorized);
  }, [logout]);

  // Đồng bộ user khi có token (thay fetchCurrentUser rời rạc ở 19 trang)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = api.getToken();
      if (token && !isTokenExpired(token)) {
        try {
          const me = await api.get('/auth/me');
          if (!cancelled && me) saveUser(me);
        } catch {
          /* giữ cache, request sau sẽ refresh/redirect */
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [saveUser]);

  const login = useCallback(
    async (email, password) => {
      const result = await api.post('/auth/login', { email, password });
      if (!result?.access_token) throw new Error('Email hoặc mật khẩu không chính xác.');
      clearUserData(); // Xóa cache user cũ trước khi nhận phiên mới
      api.setAuthPair(result);
      if (result.user) saveUser(result.user);
      return result;
    },
    [saveUser, clearUserData],
  );

  const activateAuth = useCallback(
    (authPair) => {
      if (authPair?.access_token) {
        clearUserData();
        api.setAuthPair(authPair);
        if (authPair.user) saveUser(authPair.user);
      }
    },
    [saveUser, clearUserData],
  );

  const register = useCallback(
    async (data) => {
      const result = await api.post('/auth/register', data);
      if (!result?.access_token) throw new Error('Đăng ký thất bại. Email có thể đã tồn tại.');
      return result;
    },
    [],
  );

  const guestLogin = useCallback(async () => {
    return login('chau.nguyen@vnuhcm.edu.vn', 'password123');
  }, [login]);

  const value = useMemo(
    () => ({
      user,
      ready,
      isLoggedIn: !!api.getToken(),
      login,
      register,
      activateAuth,
      guestLogin,
      logout,
      saveUser,
      refreshUser: async () => {
        const me = await api.get('/auth/me');
        saveUser(me);
        return me;
      },
    }),
    [user, ready, login, register, activateAuth, guestLogin, logout, saveUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải dùng trong <AuthProvider>');
  return ctx;
}

/** Route guard: chưa login -> /login; login nhưng chưa setup 7, 8, 9 -> /onboarding */
export function RequireAuth({ children }) {
  const { ready, isLoggedIn, user } = useAuth();
  const location = useLocation();

  if (!ready) return null;
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  const isOnboarded = user?.is_onboarded || localStorage.getItem('studi_onboarded') === 'true';
  if (!isOnboarded && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
}

/** Đã login mà vào /login|/register|/forgot -> nếu chưa setup đi /onboarding, nếu xong đi /dashboard */
export function RedirectIfAuth({ children }) {
  const { ready, isLoggedIn, user } = useAuth();
  if (!ready) return null;
  if (!isLoggedIn) return children;

  const isOnboarded = user?.is_onboarded || localStorage.getItem('studi_onboarded') === 'true';
  const target = isOnboarded ? '/dashboard' : '/onboarding';
  return <Navigate to={target} replace />;
}
