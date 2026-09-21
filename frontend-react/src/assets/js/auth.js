/**
 * Stuđiô AI - Auth & User Session Management
 */
const auth = {
  // null khi chưa có user lưu (không trả user giả để tránh che lỗi)
  getUser() {
    let userStr = null;
    try { userStr = localStorage.getItem('studi_user'); } catch { return null; }
    if (userStr) {
      try {
        return JSON.parse(userStr);
      } catch {}
    }
    return null;
  },

  // User hiển thị mặc định cho các trang công khai (landing) khi chưa login
  getDisplayUser() {
    return this.getUser() || {
      id: '',
      email: '',
      full_name: 'Khách',
      university: 'ĐHQG TP.HCM',
      major: 'Công nghệ Thông tin',
      academic_year: 3,
      chronotype: 'lark'
    };
  },

  setUser(user) {
    try { localStorage.setItem('studi_user', JSON.stringify(user)); } catch {}
  },

  isLoggedIn() {
    let token = null;
    try { token = localStorage.getItem('studi_access_token'); } catch { return false; }
    if (!token) return false;
    // Kiểm tra hạn dùng phía client (không verify chữ ký): hết hạn + không còn
    // refresh token -> coi như chưa login để guard chuyển về trang đăng nhập sớm
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        let hasRefresh = false;
        try { hasRefresh = !!localStorage.getItem('studi_refresh_token'); } catch {}
        return hasRefresh; // còn refresh -> request() đầu tiên sẽ tự gia hạn
      }
    } catch {}
    return true;
  },

  // Trải nghiệm 1-chạm = đăng nhập thật bằng tài khoản demo seed trong DB
  guestLogin() {
    if (window.showCalmToast) {
      window.showCalmToast('Đang mở Không gian học tập Stuđiô AI...', 'info');
    }
    this.login('chau.nguyen@vnuhcm.edu.vn', 'password123')
      .then((res) => {
        const hello = res && res.user && res.user.full_name ? res.user.full_name : 'bạn';
        if (window.showCalmToast) window.showCalmToast(`Chào mừng ${hello}!`, 'success');
        setTimeout(() => {
          const isPages = window.location.pathname.includes('/pages/');
          window.location.href = isPages ? '../10-dashboard/index.html' : 'pages/10-dashboard/index.html';
        }, 300);
      })
      .catch((err) => {
        if (window.showCalmToast) window.showCalmToast((err && err.message) || 'Không kết nối được máy chủ.', 'error');
      });
  },

  async fetchCurrentUser() {
    try {
      const user = await window.api.get('/auth/me');
      if (user) {
        this.setUser(user);
        this.bindUserToDOM(user);
        return user;
      }
    } catch (err) {
      console.warn('Could not fetch user profile:', err);
    }
    return this.getUser();
  },

  async login(email, password) {
    const result = await window.api.post('/auth/login', { email, password });
    // api.post ném Error nếu backend trả 400 -> caller hiện lỗi, không fallback
    if (result && result.access_token) {
      // Lưu cả cặp access + refresh token để phiên dài hạn, tự gia hạn khi hết hạn
      window.api.setAuthPair(result);
      if (result.user) {
        this.setUser(result.user);
      } else {
        await this.fetchCurrentUser();
      }
      return result;
    }
    throw new Error('Email hoặc mật khẩu không chính xác.');
  },

  async register(data) {
    const result = await window.api.post('/auth/register', data);
    if (result && result.access_token) {
      window.api.setAuthPair(result);
      if (result.user) this.setUser(result.user);
      return result;
    }
    throw new Error('Đăng ký thất bại. Email có thể đã tồn tại.');
  },

  logout() {
    window.api.removeToken();
    try {
      localStorage.removeItem('studi_user');
      localStorage.removeItem('studi_access_token');
    } catch {}
    if (window.showCalmToast) {
      window.showCalmToast('Đã đăng xuất không gian học tập an toàn.', 'info');
    }
    setTimeout(() => {
      // Đường dẫn tương đối để chạy đúng cả http://localhost:8000/ lẫn file://
      const isPages = window.location.pathname.includes('/pages/');
      window.location.href = isPages ? '../02-login/index.html' : 'pages/02-login/index.html';
    }, 400);
  },

  confirmLogout() {
    const existingModal = document.getElementById('calm-logout-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'calm-logout-modal';
    modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm calm-logout-dialog';
    modal.innerHTML = `
      <div class="glass-card bg-white/95 rounded-3xl p-6 sm:p-7 max-w-sm w-full text-center shadow-2xl border border-white/90">
        <div class="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3.5 border border-rose-100 shadow-xs">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </div>
        <h3 class="text-lg font-bold text-slate-900">Đăng xuất tài khoản?</h3>
        <p class="text-xs text-slate-500 mt-1.5 leading-relaxed">
          Tất cả dữ liệu bài tập, tiến độ Pomodoro và ghi chép học tập đã được lưu an toàn trên hệ thống.
        </p>
        <div class="mt-6 flex items-center justify-center gap-3">
          <button id="cancel-logout-btn" class="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition">
            Ở lại học tiếp
          </button>
          <button id="confirm-logout-btn" class="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-500/25 transition">
            Đăng xuất ngay
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#cancel-logout-btn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    modal.querySelector('#confirm-logout-btn').addEventListener('click', () => {
      modal.remove();
      this.logout();
    });
  },

  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = '../02-login/index.html';
      return false;
    }
    return true;
  },

  bindUserToDOM(user) {
    if (!user || !user.full_name) return;

    // Update user display names
    document.querySelectorAll('[data-user-name], .user-name-display').forEach(el => {
      el.textContent = user.full_name;
    });

    // Update user initials avatar
    const initials = user.full_name
      .split(' ')
      .map(w => w[0])
      .filter(Boolean)
      .slice(-2)
      .join('')
      .toUpperCase() || 'ST';

    document.querySelectorAll('[data-user-initials], .user-avatar-initials').forEach(el => {
      el.textContent = initials;
    });

    // Update school/major
    document.querySelectorAll('[data-user-school]').forEach(el => {
      el.textContent = user.university ? `${user.university} • ${user.major || ''}` : 'ĐHQG TP.HCM • CNTT';
    });
  }
};

// Initialize auth check on DOM loaded
document.addEventListener('DOMContentLoaded', async () => {
  const user = auth.getUser();
  if (user) {
    auth.bindUserToDOM(user);
  }
  // Try to sync latest info if token exists
  if (auth.isLoggedIn()) {
    auth.fetchCurrentUser().catch(() => {});
  }
});

window.auth = auth;
