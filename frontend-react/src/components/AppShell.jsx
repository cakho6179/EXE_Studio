import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useAudio } from '../contexts/AudioContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import { api } from '../services/api.js';
import LogoutConfirmModal from './auth/LogoutConfirmModal.jsx';

const TABS = [
  { to: '/dashboard', label: 'Tổng quan' },
  { to: '/planner', label: 'Lập kế hoạch' },
  { to: '/schedule', label: 'Lịch trình AI' },
  { to: '/tasks', label: 'Nhiệm vụ & Chia nhỏ' },
  { to: '/sound', label: 'Âm thanh & Thư giãn' },
  { to: '/advisor', label: 'Cố vấn AI' },
  { to: '/analytics', label: 'Thống kê' },
];

function initialsOf(name) {
  return (
    (name || '')
      .split(' ')
      .map((w) => w[0])
      .filter(Boolean)
      .slice(-2)
      .join('')
      .toUpperCase() || 'ST'
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const { isPlaying, track, togglePlay } = useAudio();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [isAllRead, setIsAllRead] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const notifQ = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications/list'),
    enabled: !!user,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const notifications = useMemo(() => {
    return Array.isArray(notifQ.data?.notifications) ? notifQ.data.notifications : [];
  }, [notifQ.data]);

  const unreadCount = isAllRead ? 0 : (notifQ.data?.unread_count ?? notifications.length);

  useEffect(() => {
    setMenuOpen(false);
    setProfileOpen(false);
    setNotifOpen(false);
  }, [location.pathname]);

  const openNotifications = () => {
    const next = !notifOpen;
    setNotifOpen(next);
    setProfileOpen(false);
    if (next) {
      notifQ.refetch();
    }
  };

  const doLogout = async () => {
    setLogoutLoading(true);
    try {
      await logout(true);
      showToast('Đã đăng xuất không gian học tập an toàn.', 'info');
    } catch {
      showToast('Đã đăng xuất phiên trên trình duyệt.', 'info');
    } finally {
      setLogoutLoading(false);
      setConfirmLogout(false);
      setProfileOpen(false);
    }
  };

  return (
    <div className="min-h-screen font-sans text-slate-800 antialiased relative flex flex-col">
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <img
          alt=""
          className="w-full h-full object-cover object-center brightness-[1.02] contrast-[0.98]"
          src="/assets/images/lighthouse-wide.png"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-transparent to-slate-900/25" />
        <div className="absolute inset-0 backdrop-blur-[1.5px]" />
      </div>

      <header className="sticky top-0 z-40 glass-header px-4 sm:px-6 lg:px-8 py-3 transition-all">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-4">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <img alt="Stuđiô AI Logo" className="w-9 h-9 object-contain drop-shadow-sm" src="/assets/images/logo.png" />
            <span className="hidden sm:block">
              <span className="flex items-center gap-2">
                <span className="font-bold text-lg text-slate-800 tracking-tight">Stuđiô AI</span>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-blue-100/80 text-blue-700 border border-blue-200">
                  CALM WORKSPACE
                </span>
              </span>
              <span className="block text-[11px] text-slate-500">Không gian học tập &amp; trợ lý sinh học AI</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 bg-slate-100/70 p-1 rounded-full border border-slate-200/60 shadow-inner">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                className={({ isActive }) =>
                  isActive
                    ? 'px-4 py-1.5 rounded-full text-xs font-semibold bg-brand-600 text-white shadow-sm transition'
                    : 'px-3.5 py-1.5 rounded-full text-xs font-medium text-slate-600 hover:text-slate-900 transition leading-tight text-center'
                }
              >
                {t.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Mở menu điều hướng"
              aria-expanded={menuOpen}
              className="md:hidden p-2 rounded-xl border border-slate-200 bg-white/80 text-slate-700 shadow-sm"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <button
              type="button"
              onClick={togglePlay}
              title="Phát / Dừng âm thanh tĩnh lặng"
              className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50/90 border border-blue-100 text-xs text-blue-700 font-medium"
            >
              <svg className="w-3.5 h-3.5 text-blue-600 animate-spin" style={{ animationDuration: '6s' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
              <span>{isPlaying ? track.title : 'Sóng biển 432Hz'}</span>
            </button>

            <button
              type="button"
              onClick={openNotifications}
              aria-label="Thông báo"
              title="Thông báo"
              className="relative p-2 rounded-full hover:bg-white/80 text-slate-600 transition cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 ring-2 ring-white" />
                </span>
              )}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen((v) => !v);
                  setNotifOpen(false);
                }}
                title="Hồ sơ / Đăng xuất"
                className="flex items-center gap-2.5 pl-2 border-l border-slate-200/80 cursor-pointer select-none"
              >
                <span className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-semibold flex items-center justify-center text-xs shadow-sm ring-2 ring-white">
                  {initialsOf(user?.full_name)}
                </span>
                <span className="hidden sm:block text-left">
                  <span className="block text-xs font-bold text-slate-800 leading-tight">{user?.full_name || ''}</span>
                  <span className="block text-[11px] text-slate-500 leading-tight">
                    {user ? `${user.university || ''} • ${user.major || ''}` : ''}
                  </span>
                </span>
                <span className="text-slate-400 text-xs">▾</span>
              </button>

              {profileOpen && (
                <div className="profile-dropdown-menu active text-left">
                  <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-md ring-2 ring-white">
                      {initialsOf(user?.full_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-slate-900 truncate leading-tight">{user?.full_name || ''}</h4>
                      <p className="text-[11px] text-slate-500 truncate">{user?.email || ''}</p>
                    </div>
                  </div>
                  <div className="space-y-1 py-1 text-xs">
                    <Link
                      to="/profile"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-slate-700 hover:bg-slate-100 transition font-medium"
                    >
                      <span>👤</span>
                      <span>Hồ sơ sinh học &amp; Cá nhân</span>
                    </Link>
                    <Link
                      to="/analytics"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-slate-700 hover:bg-slate-100 transition font-medium"
                    >
                      <span>📈</span>
                      <span>Thống kê giờ học &amp; Chuỗi ngày</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        setConfirmLogout(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-slate-700 hover:bg-slate-100 transition font-medium cursor-pointer text-left"
                    >
                      <span>🔄</span>
                      <span>Đổi tài khoản / Đăng nhập lại</span>
                    </button>
                  </div>
                  <div className="pt-2 border-t border-slate-100 mt-1">
                    <button
                      type="button"
                      onClick={() => setConfirmLogout(true)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200/80 transition-all cursor-pointer"
                    >
                      Đăng xuất khỏi Stuđiô AI
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Backdrop đóng dropdown khi bấm ra ngoài */}
        {(profileOpen || notifOpen) && (
          <div
            className="fixed inset-0 z-30 bg-transparent"
            onClick={() => {
              setProfileOpen(false);
              setNotifOpen(false);
            }}
            aria-hidden="true"
          />
        )}

        {menuOpen && (
          <nav className="md:hidden mt-2 p-3 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-2xl shadow-lg grid grid-cols-2 gap-2">
            {TABS.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                className="px-3 py-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-semibold border border-slate-200/70"
              >
                {t.label}
              </Link>
            ))}
          </nav>
        )}

        {notifOpen && (
          <div className="absolute top-full left-0 right-0 z-50 p-3">
            <div className="max-w-md ml-auto bg-white/95 backdrop-blur-xl border border-slate-200 rounded-2xl shadow-xl p-4">
              <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>🔔</span>
                  <span>Thông báo học thuật</span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-100 text-rose-700">
                      {unreadCount}
                    </span>
                  )}
                </h3>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAllRead(true);
                      showToast('Đã đánh dấu đã đọc tất cả thông báo.', 'info');
                    }}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition cursor-pointer"
                  >
                    Đã đọc tất cả
                  </button>
                )}
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {notifications.length === 0 && (
                  <div className="py-6 text-center text-xs text-slate-500 space-y-1">
                    <p className="text-base">✨</p>
                    <p className="font-semibold text-slate-700">Không có thông báo mới.</p>
                    <p className="text-[11px] text-slate-400">Bạn đã cập nhật hết mọi lịch học và nhiệm vụ!</p>
                  </div>
                )}
                {notifications.map((n, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      setNotifOpen(false);
                      if (n.link) navigate(n.link);
                    }}
                    className={`p-3 rounded-2xl border transition-all ${
                      n.link ? 'cursor-pointer hover:shadow-xs hover:border-blue-300' : ''
                    } ${
                      n.tone === 'urgent'
                        ? 'bg-rose-50/70 border-rose-100 hover:bg-rose-50'
                        : n.tone === 'success'
                        ? 'bg-emerald-50/70 border-emerald-100 hover:bg-emerald-50'
                        : 'bg-blue-50/70 border-blue-100 hover:bg-blue-50'
                    } flex items-start gap-2.5`}
                  >
                    <span className="text-base shrink-0">{n.icon || '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="font-bold text-slate-800 text-xs truncate">{n.title || ''}</p>
                        {n.time_label && (
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                              n.tone === 'urgent'
                                ? 'text-rose-700 bg-rose-100/80'
                                : 'text-blue-700 bg-blue-100/80'
                            }`}
                          >
                            {n.time_label}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-600 mt-0.5 text-[11px] leading-relaxed">{n.detail || ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="relative z-10 flex-1 w-full">
        <Outlet />
      </main>

      <LogoutConfirmModal
        isOpen={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={doLogout}
        loading={logoutLoading}
        userEmail={user?.email}
      />
    </div>
  );
}

export function useNavigateHome() {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  return () => navigate(isLoggedIn ? '/dashboard' : '/login', { replace: true });
}
