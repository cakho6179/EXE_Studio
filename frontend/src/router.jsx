import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell.jsx';
import { RequireAuth, RedirectIfAuth } from './contexts/AuthContext.jsx';
import LoginView from './views/LoginView.jsx';
import LandingView from './views/LandingView.jsx';

const RegisterView = lazy(() => import('./views/RegisterView.jsx'));
const ForgotView = lazy(() => import('./views/ForgotView.jsx'));
const VerifyView = lazy(() => import('./views/VerifyView.jsx'));
const DashboardView = lazy(() => import('./views/DashboardView.jsx'));
const TasksView = lazy(() => import('./views/TasksView.jsx'));
const ScheduleView = lazy(() => import('./views/ScheduleView.jsx'));
const AdvisorView = lazy(() => import('./views/AdvisorView.jsx'));
const SoundView = lazy(() => import('./views/SoundView.jsx'));
const AnalyticsView = lazy(() => import('./views/AnalyticsView.jsx'));
const PlannerView = lazy(() => import('./views/PlannerView.jsx'));
const DeepWorkView = lazy(() => import('./views/DeepWorkView.jsx'));
const OnboardingView = lazy(() => import('./views/OnboardingView.jsx'));
const ProfileView = lazy(() => import('./views/ProfileView.jsx'));

function Loading() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center text-sm text-slate-500">
      <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse mr-2" />
      Đang mở không gian…
    </div>
  );
}

// AppShell render <Outlet/> nên các view con tự nằm trong layout shell.
export default function AppRouter() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<LandingView />} />
        <Route path="/login" element={<RedirectIfAuth><LoginView /></RedirectIfAuth>} />
        <Route path="/register" element={<RedirectIfAuth><RegisterView /></RedirectIfAuth>} />
        <Route path="/forgot" element={<RedirectIfAuth><ForgotView /></RedirectIfAuth>} />
        <Route path="/verify" element={<VerifyView />} />
        <Route
          path="/onboarding"
          element={
            <RequireAuth>
              <OnboardingView />
            </RequireAuth>
          }
        />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/dashboard" element={<DashboardView />} />
          <Route path="/tasks" element={<TasksView />} />
          <Route path="/deepwork" element={<DeepWorkView />} />
          <Route path="/planner" element={<PlannerView />} />
          <Route path="/profile" element={<ProfileView />} />
          <Route path="/schedule" element={<ScheduleView />} />
          <Route path="/advisor" element={<AdvisorView />} />
          <Route path="/sound" element={<SoundView />} />
          <Route path="/analytics" element={<AnalyticsView />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
