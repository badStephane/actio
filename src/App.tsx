import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { getVersion } from '@tauri-apps/api/app';
import { ClipboardList, PlusCircle, Home as HomeIcon, Lock, KeyRound, LifeBuoy, CalendarDays, Menu, X, Settings, History } from 'lucide-react';
import Home from './pages/Home';
import Activities from './pages/Activities';
import ActivityStats from './pages/ActivityStats';
import Audit from './pages/Audit';
import ImportReview from './pages/ImportReview';
import RegistrationForm from './components/RegistrationForm';
import RegistrationList from './components/RegistrationList';
import AuthGate from './components/AuthGate';
import { useAuth } from './components/authContext';
import ErrorBoundary from './components/ErrorBoundary';
import ChangePasswordModal from './components/ChangePasswordModal';
import RecoveryCodeModal from './components/RecoveryCodeModal';
import PreferencesModal from './components/PreferencesModal';
import UpdateChecker from './components/UpdateChecker';
import DemoBanner from './components/DemoBanner';
import { DEMO_MODE } from './utils/demo';
import actioLogo from './assets/brand/actio-logo.svg';
import actioLogoDark from './assets/brand/actio-logo-dark.svg';
import GlobalShortcuts from './components/GlobalShortcuts';
import { NEW_REGISTRATION_SHORTCUT_LABEL } from './components/shortcuts';

/*
 * 3.1 Sidebar marine du logo (brand-900). Ratios calculés : slate-300 sur marine 9,6:1 ; texte blanc
 * sur l'entrée active (blanc 10 %) 10,6:1 ; filet brand-400 sur l'entrée active 3,75:1.
 */
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 pl-2.5 pr-2 py-2.5 min-h-[44px] rounded-control text-sm text-left transition-colors duration-fast border-l-[3px] ${
    isActive
      ? 'bg-white/10 text-white font-semibold border-brand-400'
      : 'text-slate-300 hover:bg-white/5 hover:text-white border-transparent'
  }`;

const accountActionClass =
  'w-full flex items-center gap-2 pl-2.5 pr-2 py-2.5 min-h-[44px] rounded-control text-sm text-left text-slate-300 hover:bg-white/5 hover:text-white transition-colors duration-fast border-l-[3px] border-transparent';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Tableau de bord',
  '/add': 'Nouvelle inscription',
  '/registrations': 'Liste des inscriptions',
  '/activities': 'Activités',
  '/audit': 'Historique',
  '/imports/review': 'Contrôle des imports',
};

function PageHeader() {
  const location = useLocation();
  const path = location.pathname;
  let title = '';
  if (path.startsWith('/edit/')) title = "Modifier l'inscription";
  else if (path.startsWith('/activities/') && path.endsWith('/stats')) title = '';
  else title = PAGE_TITLES[path] || '';

  if (!title && !DEMO_MODE) return null;

  // 3.2 : même conteneur que les pages (bord gauche à 232 px) ; 3.4 : badge démo à droite.
  return (
    <div className="w-full max-w-6xl px-6 pt-5 short:pt-3 pb-0 flex items-center justify-between gap-4">
      {title ? <h1 className="text-xl font-semibold text-ink">{title}</h1> : <span />}
      <DemoBanner />
    </div>
  );
}

/** Réinitialise la limite d'erreur à chaque changement de page (M4). */
function RoutesWithBoundary() {
  const location = useLocation();
  return (
    <ErrorBoundary variant="page" resetKey={location.pathname}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/add" element={<RegistrationForm />} />
        <Route path="/edit/:id" element={<RegistrationForm />} />
        <Route path="/registrations" element={<RegistrationList />} />
        <Route path="/activities" element={<Activities />} />
        <Route path="/activities/:id/stats" element={<ActivityStats />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/imports/review" element={<ImportReview />} />
      </Routes>
    </ErrorBoundary>
  );
}

function AppShell() {
  const { lock } = useAuth();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [recoveryCodeOpen, setRecoveryCodeOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(''));
  }, []);

  return (
    <Router>
      <UpdateChecker>
        <GlobalShortcuts />
        <div className="h-full flex">
          {/* Mobile overlay */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Sidebar */}
          <aside className={`on-dark
            fixed inset-y-0 left-0 z-50 w-52 bg-brand-900 flex flex-col border-r border-white/10
            transform transition-transform duration-200 ease-out
            lg:relative lg:translate-x-0 lg:z-auto
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}>
            {/* App title */}
            <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between">
              {/* D24 : logo complet en version sombre (texte blanc, coche verte), environ 28 px. */}
              <img src={actioLogoDark} alt="Actio" className="h-7 w-auto" />
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden text-slate-300 hover:text-white"
                aria-label="Fermer le menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-2 py-3 space-y-0.5">
              <NavLink to="/" end className={navLinkClass} onClick={() => setSidebarOpen(false)}>
                <HomeIcon className="h-4 w-4" />
                Accueil
              </NavLink>
              <NavLink
                to="/add"
                className={navLinkClass}
                onClick={() => setSidebarOpen(false)}
                aria-keyshortcuts="Control+N F2"
              >
                <PlusCircle className="h-4 w-4" aria-hidden="true" />
                Nouvelle inscription
                <kbd className="kbd ml-auto border-slate-400 text-slate-300" aria-hidden="true">
                  {NEW_REGISTRATION_SHORTCUT_LABEL}
                </kbd>
              </NavLink>
              <NavLink to="/registrations" className={navLinkClass} onClick={() => setSidebarOpen(false)}>
                <ClipboardList className="h-4 w-4" />
                Liste
              </NavLink>
              <NavLink to="/activities" className={navLinkClass} onClick={() => setSidebarOpen(false)}>
                <CalendarDays className="h-4 w-4" />
                Activités
              </NavLink>
              <NavLink to="/audit" className={navLinkClass} onClick={() => setSidebarOpen(false)}>
                <History className="h-4 w-4" />
                Historique
              </NavLink>
            </nav>

            {/* Account actions */}
            <div className="border-t border-white/10 px-2 py-2 space-y-0.5">
              <button onClick={() => setChangePasswordOpen(true)} className={accountActionClass}>
                <KeyRound className="h-4 w-4" />
                Mot de passe
              </button>
              <button onClick={() => setRecoveryCodeOpen(true)} className={accountActionClass}>
                <LifeBuoy className="h-4 w-4" />
                Code de récupération
              </button>
              <button onClick={() => setPreferencesOpen(true)} className={accountActionClass}>
                <Settings className="h-4 w-4" />
                Préférences
              </button>
              <button onClick={lock} className={accountActionClass}>
                <Lock className="h-4 w-4" />
                Verrouiller
              </button>
            </div>

            {/* Version footer */}
            <div className="px-4 py-3 border-t border-white/10">
              <p className="text-xs text-slate-400">
                Actio{version ? ` v${version}` : ''}
              </p>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-auto bg-surface-app flex flex-col min-w-0">
            {/* Mobile top bar */}
            <div className="lg:hidden flex items-center gap-3 px-4 py-3 short:py-2 border-b border-gray-200 bg-white">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1 -ml-1 text-gray-600 hover:text-gray-900"
                aria-label="Ouvrir le menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <img src={actioLogo} alt="Actio" className="h-6 w-auto" />
            </div>

            <PageHeader />

            <div className="flex-1 overflow-auto">
              <RoutesWithBoundary />
            </div>
          </main>
        </div>

        <ChangePasswordModal
          open={changePasswordOpen}
          onClose={() => setChangePasswordOpen(false)}
        />

        <RecoveryCodeModal
          open={recoveryCodeOpen}
          onClose={() => setRecoveryCodeOpen(false)}
        />

        <PreferencesModal
          open={preferencesOpen}
          onClose={() => setPreferencesOpen(false)}
        />

      </UpdateChecker>
    </Router>
  );
}

function App() {
  return (
    <AuthGate>
      <AppShell />
    </AuthGate>
  );
}

export default App;
