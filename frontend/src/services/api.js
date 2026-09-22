/**
 * Stuđiô AI - API service (port ESM từ assets/js/api.js).
 * Base tương đối /api/v1 (Vite proxy về FastAPI khi dev, cùng origin khi deploy).
 */

const API_BASE_URL = '/api/v1';

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, val) {
  try {
    localStorage.setItem(key, val);
  } catch {
    /* storage bị chặn: bỏ qua */
  }
}

function safeDel(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* bỏ qua */
  }
}

let refreshPromise = null;

export const api = {
  baseUrl: API_BASE_URL,

  getToken() {
    return safeGet('studi_access_token');
  },

  setToken(token) {
    safeSet('studi_access_token', token);
  },

  getRefreshToken() {
    return safeGet('studi_refresh_token');
  },

  setRefreshToken(token) {
    safeSet('studi_refresh_token', token);
  },

  removeToken() {
    safeDel('studi_access_token');
    safeDel('studi_refresh_token');
    safeDel('studi_user');
  },

  setAuthPair(data) {
    if (!data) return;
    if (data.access_token) this.setToken(data.access_token);
    if (data.refresh_token) this.setRefreshToken(data.refresh_token);
    if (data.user) safeSet('studi_user', JSON.stringify(data.user));
  },

  async refreshSession() {
    if (refreshPromise) return refreshPromise;
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;

    refreshPromise = (async () => {
      try {
        const resp = await fetch(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!resp.ok) return false;
        const data = await resp.json();
        this.setAuthPair(data);
        return true;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  },

  async request(endpoint, options = {}, _retried = false) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Tự động phân bổ thời gian timeout: các tác vụ AI và đồng bộ dài cho phép tới 60s
    const isHeavyCall = endpoint.includes('/ai-decompose') ||
                        endpoint.includes('/study-plans/generate') ||
                        endpoint.includes('/lms-sync') ||
                        endpoint.includes('/documents');
    const timeoutMs = options.timeout || (isHeavyCall ? 60000 : 15000);

    let response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      response = await fetch(url, { ...options, headers, signal: controller.signal });
      clearTimeout(timeoutId);
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('Yêu cầu quá thời gian phản hồi (timeout). Vui lòng thử lại.');
      }
      throw new Error('Không kết nối được máy chủ Stuđiô AI.');
    }

    if (response.status === 401) {
      // Thử refresh 1 lần trước khi coi như hết phiên (trừ chính các endpoint auth)
      const isAuthCall = endpoint.includes('/auth/login') || endpoint.includes('/auth/refresh');
      if (!_retried && !isAuthCall && this.getRefreshToken()) {
        const refreshed = await this.refreshSession();
        if (refreshed) {
          return this.request(endpoint, options, true);
        }
      }
      this.removeToken();
      const err = new Error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
      err.code = 401;
      window.dispatchEvent(new CustomEvent('studi:unauthorized'));
      throw err;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      let msg = data.message;
      if (!msg && Array.isArray(data.detail)) {
        msg = data.detail.map((d) => (typeof d === 'string' ? d : (d.msg || JSON.stringify(d)))).join('; ');
      } else if (!msg && typeof data.detail === 'object' && data.detail !== null) {
        msg = JSON.stringify(data.detail);
      } else if (!msg && typeof data.detail === 'string') {
        msg = data.detail;
      }
      throw new Error(msg || `Yêu cầu thất bại (${response.status}).`);
    }
    return data;
  },

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  post(endpoint, body) {
    return this.request(endpoint, { method: 'POST', body: JSON.stringify(body) });
  },

  patch(endpoint, body) {
    return this.request(endpoint, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
  },

  put(endpoint, body) {
    return this.request(endpoint, { method: 'PUT', body: JSON.stringify(body) });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },

  async postForm(endpoint, formData, _retried = false) {
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
      if (!_retried && this.getRefreshToken()) {
        const refreshed = await this.refreshSession();
        if (refreshed) {
          return this.postForm(endpoint, formData, true);
        }
      }
      this.removeToken();
      const err = new Error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
      err.code = 401;
      window.dispatchEvent(new CustomEvent('studi:unauthorized'));
      throw err;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || 'Tải file thất bại.');
    return data;
  },
};

export function getStoredUser() {
  try {
    const raw = localStorage.getItem('studi_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isTokenExpired(token) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp ? payload.exp * 1000 < Date.now() : false;
  } catch {
    return false;
  }
}
