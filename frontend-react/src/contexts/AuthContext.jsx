import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, getStoredUser, isTokenExpired } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => getStoredUser());
  const [ready, setReady] = useState(false);

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
        saveUser(null);
        if (redirect) navigate('/login', { replace: true });
      }
    },
    [navigate, saveUser],
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
      api.setAuthPair(result);
      if (result.user) saveUser(result.user);
      return result;
    },
    [saveUser],
  );

  const activateAuth = useCallback(
    (authPair) => {
      if (authPair?.access_token) {
        api.setAuthPair(authPair);
        if (authPair.user) saveUser(authPair.user);
      }
    },
    [saveUser],
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
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!ready) return;
    if (!isLoggedIn) {
      navigate('/login', { replace: true });
      return;
    }

    const isOnboarded = user?.is_onboarded || localStorage.getItem('studi_onboarded') === 'true';
    if (!isOnboarded && location.pathname !== '/onboarding') {
      navigate('/onboarding', { replace: true });
    }
  }, [ready, isLoggedIn, user, location.pathname, navigate]);

  if (!ready) return null;
  if (!isLoggedIn) return null;
  return children;
}

/** Đã login mà vào /login|/register|/forgot -> nếu chưa setup đi /onboarding, nếu xong đi /dashboard */
export function RedirectIfAuth({ children }) {
  const { ready, isLoggedIn, user } = useAuth();
  if (!ready) return null;
  if (!isLoggedIn) return children;

  const isOnboarded = user?.is_onboarded || localStorage.getItem('studi_onboarded') === 'true';
  const target = isOnboarded ? '/dashboard' : '/onboarding';
  return <NavigateToTarget target={target} />;
}

function NavigateToTarget({ target }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(target, { replace: true });
  }, [navigate, target]);
  return null;
}
