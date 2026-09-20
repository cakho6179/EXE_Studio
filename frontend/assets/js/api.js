/**
 * Stuđiô AI - API Client (gọi backend FastAPI + SQLite thật, không mock dữ liệu)
 */
const API_BASE_URL = window.location.origin.includes('8000')
  ? `${window.location.origin}/api/v1`
  : 'http://localhost:8000/api/v1';

const api = {
  baseUrl: API_BASE_URL,

  getToken() {
    return localStorage.getItem('studi_access_token') || null;
  },

  setToken(token) {
    localStorage.setItem('studi_access_token', token);
  },

  removeToken() {
    localStorage.removeItem('studi_access_token');
    localStorage.removeItem('studi_user');
  },

  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let response;
    try {
      // Timeout guard 10s
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    } catch (error) {
      throw new Error('Không kết nối được máy chủ Stuđiô AI. Kiểm tra backend cổng 8000.');
    }

    if (response.status === 401) {
      this.removeToken();
      const err = new Error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
      err.code = 401;
      // Workspace đang mở mà mất phiên -> về login (trừ chính các trang auth)
      try {
        const p = window.location.pathname;
        const onAuth = /0[2-6]-/.test(p) || p.includes('01-landing');
        if (!onAuth && !window.__authRedirecting) {
          window.__authRedirecting = true;
          if (window.showCalmToast) showCalmToast(err.message, 'warning');
          setTimeout(() => { window.location.href = '../02-login/index.html'; }, 600);
        }
      } catch {}
      throw err;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || data.message || `Yêu cầu thất bại (${response.status}).`);
    }
    return data;
  },

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  patch(endpoint, body) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },

  // Upload file thật (multipart/form-data, không ép Content-Type JSON)
  async postForm(endpoint, formData) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const headers = {};
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    let response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      response = await fetch(url, { method: 'POST', headers, body: formData, signal: controller.signal });
      clearTimeout(timeoutId);
    } catch (error) {
      throw new Error('Không kết nối được máy chủ Stuđiô AI.');
    }
    if (response.status === 401) {
      this.removeToken();
      throw new Error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || 'Tải file thất bại.');
    return data;
  },

};

/**
 * Calm Toast System - Gentle, non-intrusive notifications
 */
function showCalmToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('calm-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'calm-toast-container';
    container.style.cssText = `
      position: fixed;
      bottom: 28px;
      right: 28px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  const icons = {
    success: '🌿',
    info: '🌊',
    warning: '🌤️',
    error: '🍃'
  };

  const borderColors = {
    success: 'rgba(16, 185, 129, 0.4)',
    info: 'rgba(59, 130, 246, 0.4)',
    warning: 'rgba(245, 158, 11, 0.4)',
    error: 'rgba(244, 63, 94, 0.4)'
  };

  toast.style.cssText = `
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid ${borderColors[type] || 'rgba(255, 255, 255, 0.8)'};
    box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    border-radius: 16px;
    padding: 12px 18px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: 'Be Vietnam Pro', sans-serif;
    font-size: 13px;
    color: #1e293b;
    max-width: 380px;
    pointer-events: auto;
    opacity: 0;
    transform: translateY(12px) scale(0.96);
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  toast.innerHTML = `
    <span style="font-size: 16px; flex-shrink: 0;">${icons[type] || '✨'}</span>
    <span style="line-height: 1.4; font-weight: 500;">${message}</span>
  `;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0) scale(1)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-6px) scale(0.96)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

window.api = api;
window.showCalmToast = showCalmToast;
