import { Box, CircularProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { useTRPC } from '#client/hooks/trpc.ts';
import Header from './App/Header.tsx';
import Notifications from './App/Notifications.tsx';
import EmployeesPage from './EmployeesPage.tsx';
import LoginCallbackPage from './LoginCallbackPage.tsx';
import LoginPage from './LoginPage.tsx';
import ProfilePage from './ProfilePage.tsx';

// Header tabs. `label` is a translation key.
const pages = [
  { path: '/employees', component: EmployeesPage, label: 'nav.employees' },
  { path: '/profile', component: ProfilePage, label: 'nav.profile' },
] as const;

type PagePath = (typeof pages)[number]['path'];

export default function () {
  const trpc = useTRPC();
  const { i18n } = useTranslation();
  const me = useQuery(trpc.Auth.me.queryOptions());

  // Interface language follows the employee's profile.
  useEffect(() => {
    if (me.data && i18n.language !== me.data.locale) void i18n.changeLanguage(me.data.locale);
  }, [me.data, i18n]);

  if (me.isPending) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <Notifications />
      {me.data ? (
        <SignedIn />
      ) : (
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/login/:token" element={<LoginCallbackPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      )}
    </>
  );
}

function SignedIn() {
  const { pathname } = useLocation();
  const activePath = pages.find((p) => p.path === pathname)?.path;

  // A page is mounted on first visit and then stays in the DOM to keep its state.
  const [loaded, setLoaded] = useState<Partial<Record<PagePath, true>>>({});
  useEffect(() => {
    if (activePath && !loaded[activePath]) setLoaded((prev) => ({ ...prev, [activePath]: true }));
  }, [activePath, loaded]);

  if (!activePath) return <Navigate to={pages[0].path} replace />;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Header tabs={pages} activePath={activePath} />
      {pages.map(
        ({ path, component: Page }) =>
          loaded[path] && (
            <Box
              component="main"
              key={path}
              sx={{ display: activePath === path ? 'flex' : 'none', flexGrow: 1, p: 2, overflow: 'auto' }}
            >
              <Page />
            </Box>
          ),
      )}
    </Box>
  );
}
