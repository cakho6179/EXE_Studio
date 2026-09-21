import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { api, getStoredUser, isTokenExpired } from './api.js';

const b64 = (obj) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (exp) => `h.${b64({ exp })}.s`;

describe('isTokenExpired', () => {
  it('empty/missing -> true', () => {
    expect(isTokenExpired('')).toBe(true);
    expect(isTokenExpired(null)).toBe(true);
    expect(isTokenExpired(undefined)).toBe(true);
  });
  it('expired -> true', () => {
    expect(isTokenExpired(jwt(Math.floor(Date.now() / 1000) - 60))).toBe(true);
  });
  it('valid -> false', () => {
    expect(isTokenExpired(jwt(Math.floor(Date.now() / 1000) + 3600))).toBe(false);
  });
  it('malformed -> false (khong tu logout)', () => {
    expect(isTokenExpired('not-a-jwt')).toBe(false);
  });
});

describe('getStoredUser', () => {
  beforeEach(() => localStorage.clear());
  it('null khi chua login', () => {
    expect(getStoredUser()).toBeNull();
  });
  it('parse user da luu', () => {
    localStorage.setItem('studi_user', JSON.stringify({ email: 'a@b.c' }));
    expect(getStoredUser()).toEqual({ email: 'a@b.c' });
  });
  it('JSON rac -> null', () => {
    localStorage.setItem('studi_user', '{broken');
    expect(getStoredUser()).toBeNull();
  });
});

describe('api.request 401 + refresh', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('401 + refresh ok -> retry 1 lan', async () => {
    localStorage.setItem('studi_access_token', 'old');
    localStorage.setItem('studi_refresh_token', 'rt');
    const ok = (body) => ({ ok: true, status: 200, json: async () => body });
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce(ok({ access_token: 'new', refresh_token: 'rt2' }))
      .mockResolvedValueOnce(ok({ hello: 1 }));
    const res = await api.get('/tasks/');
    expect(res).toEqual({ hello: 1 });
    expect(localStorage.getItem('studi_access_token')).toBe('new');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('401 + khong refresh token -> logout + event', async () => {
    localStorage.setItem('studi_access_token', 'old');
    const spy = vi.fn();
    window.addEventListener('studi:unauthorized', spy, { once: true });
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await expect(api.get('/tasks/')).rejects.toMatchObject({ code: 401 });
    expect(localStorage.getItem('studi_access_token')).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('loi mang -> message tieng Viet', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('down'));
    await expect(api.get('/tasks/')).rejects.toThrow('Không kết nối được máy chủ');
  });
});
