import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import AppLayout from './layout/AppLayout';
import { MetaAdsProvider } from './contexts/MetaAdsContext';
import { AgencyProvider } from './contexts/AgencyContext';
import { AlertsProvider } from './contexts/AlertsContext';
import { ChangeLogProvider } from './contexts/ChangeLogContext';
import { PreferencesProvider } from './contexts/PreferencesContext';

// Code-split: cada rota carrega seu bundle sob demanda
const LoginPage = lazy(() => import('./modules/login'));
const AuthCallback = lazy(() => import('./modules/auth/AuthCallback'));
const Dashboard = lazy(() => import('./modules/dashboard'));
const MetaAdsOverview = lazy(() => import('./modules/meta-ads'));
const MetaBalances = lazy(() => import('./modules/meta-balances'));
const DetailedView = lazy(() => import('./modules/detailed-view'));
const Settings = lazy(() => import('./modules/settings'));
const ReportText = lazy(() => import('./modules/report-text'));
const ReportVisual = lazy(() => import('./modules/report-visual'));
const CampaignAnalysis = lazy(() => import('./modules/campaign-analysis'));
const AutoAlerts = lazy(() => import('./modules/auto-alerts'));

function PageLoader() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-10 h-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
          <div className="absolute inset-0 w-10 h-10 border-3 border-transparent border-b-primary-light/30 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
        </div>
        <p className="text-text-secondary text-sm font-medium animate-pulse">Carregando...</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PreferencesProvider>
          <AgencyProvider>
            <MetaAdsProvider>
            <AlertsProvider>
              <ChangeLogProvider>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    {/* Public routes */}
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/auth/callback" element={<AuthCallback />} />

                    {/* Protected routes — require login */}
                    <Route
                      element={
                        <PrivateRoute>
                          <AppLayout />
                        </PrivateRoute>
                      }
                    >
                      <Route index element={<Dashboard />} />
                      <Route path="meta-ads" element={<MetaAdsOverview />} />
                      <Route path="saldos-meta" element={<MetaBalances />} />
                      <Route path="visao-detalhada" element={<DetailedView />} />
                      <Route path="relatorio-texto" element={<ReportText />} />
                      <Route path="relatorio-visual" element={<ReportVisual />} />
                      <Route path="analise-ia" element={<CampaignAnalysis />} />
                      <Route path="avisos" element={<AutoAlerts />} />
                      <Route path="configuracoes" element={<Settings />} />
                    </Route>

                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </ChangeLogProvider>
            </AlertsProvider>
          </MetaAdsProvider>
          </AgencyProvider>
        </PreferencesProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
