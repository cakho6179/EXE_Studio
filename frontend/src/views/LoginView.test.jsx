import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../contexts/ToastContext.jsx';
import { AudioProvider } from '../contexts/AudioContext.jsx';
import { AuthProvider } from '../contexts/AuthContext.jsx';
import LoginView from './LoginView.jsx';

function renderLogin() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <AudioProvider>
            <AuthProvider>
              <LoginView />
            </AuthProvider>
          </AudioProvider>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('LoginView', () => {
  it('render form email + password + submit', () => {
    renderLogin();
    expect(screen.getByPlaceholderText('name@vnuhcm.edu.vn hoặc MSSV')).toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeInTheDocument();
    expect(document.querySelector('button[type="submit"]')).toBeInTheDocument();
  });

  it('submit rong -> bao loi email', async () => {
    renderLogin();
    fireEvent.submit(document.querySelector('form'));
    expect(await screen.findByText('Vui lòng nhập địa chỉ email hoặc mã sinh viên.')).toBeInTheDocument();
  });

  it('co email thieu password -> bao loi password', async () => {
    renderLogin();
    fireEvent.change(screen.getByPlaceholderText('name@vnuhcm.edu.vn hoặc MSSV'), {
      target: { value: 'a@b.c' },
    });
    fireEvent.submit(document.querySelector('form'));
    expect(await screen.findByText('Vui lòng nhập mật khẩu.')).toBeInTheDocument();
  });
});
