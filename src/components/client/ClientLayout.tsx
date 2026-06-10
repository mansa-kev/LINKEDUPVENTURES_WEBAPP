import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  Car,
  FileText,
  Award,
  Inbox,
  Settings as SettingsIcon,
  Menu,
  X,
  ChevronDown,
  ChevronUp,
  User,
  Search,
} from 'lucide-react';
import { Logo } from '../shared/Logo';
import { LogoLoader } from '../shared/LogoLoader';
import { PortalHeader } from '../PortalHeader';

const importDashboard = () => import('./Dashboard');
const importDigitalGlovebox = () => import('./DigitalGlovebox');
const importMyInbox = () => import('./MyInbox');
const importMyBookings = () => import('./MyBookings');
const importMyProfile = () => import('./MyProfile');
const importSettings = () => import('./Settings');
const importLoyaltyRewards = () => import('./LoyaltyRewards');
const importBrowseAndBook = () => import('./BrowseAndBook');

const Dashboard = React.lazy(() => importDashboard().then(m => ({ default: m.Dashboard })));
const DigitalGlovebox = React.lazy(() => importDigitalGlovebox().then(m => ({ default: m.DigitalGlovebox })));
const MyInbox = React.lazy(() => importMyInbox().then(m => ({ default: m.MyInbox })));
const MyBookings = React.lazy(() => importMyBookings().then(m => ({ default: m.MyBookings })));
const MyProfile = React.lazy(() => importMyProfile().then(m => ({ default: m.MyProfile })));
const Settings = React.lazy(() => importSettings().then(m => ({ default: m.Settings })));
const LoyaltyRewards = React.lazy(() => importLoyaltyRewards().then(m => ({ default: m.LoyaltyRewards })));
const BrowseAndBook = React.lazy(() => importBrowseAndBook().then(m => ({ default: m.BrowseAndBook })));

const CLIENT_MODULE_PRELOADERS: Record<string, () => Promise<unknown>> = {
  '/client': importDashboard,
  '/client/browse': importBrowseAndBook,
  '/client/bookings': importMyBookings,
  '/client/profile': importMyProfile,
  '/client/glovebox': importDigitalGlovebox,
  '/client/rewards': importLoyaltyRewards,
  '/client/inbox': importMyInbox,
  '/client/settings': importSettings,
};

const scheduleIdle = (cb: () => void) => {
  if (typeof window === 'undefined') return () => {};
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(cb, { timeout: 1200 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(cb, 250);
  return () => window.clearTimeout(id);
};

const navGroups = [
  {
    category: 'Main',
    items: [
      { name: 'Dashboard', path: '/client', icon: LayoutDashboard },
      { name: 'Browse Cars', path: '/client/browse', icon: Search },
      { name: 'My Bookings', path: '/client/bookings', icon: Car },
    ]
  },
  {
    category: 'Account',
    items: [
      { name: 'My Profile', path: '/client/profile', icon: User },
      { name: 'Digital Glovebox', path: '/client/glovebox', icon: FileText },
      { name: 'Loyalty & Rewards', path: '/client/rewards', icon: Award },
    ]
  },
  {
    category: 'Support',
    items: [
      { name: 'My Inbox', path: '/client/inbox', icon: Inbox },
      { name: 'Settings', path: '/client/settings', icon: SettingsIcon },
    ]
  }
];

export function ClientLayout() {
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const isDarkMode = theme === 'dark';
  const setIsDarkMode = (isDark: boolean) => setTheme(isDark ? 'dark' : 'light');

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(() => {
    // Default: expand the group containing the active route
    const active = navGroups.find(g => g.items.some(i => i.path === location.pathname));
    return active?.category ?? 'Main';
  });

  // Responsive detection
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [location.pathname, isMobile]);

  const toggleGroup = useCallback((category: string) => {
    setExpandedGroup(prev => {
      if (isMobile) return prev === category ? null : category;
      return prev === category ? null : category;
    });
  }, [isMobile]);

  useEffect(() => {
    CLIENT_MODULE_PRELOADERS[location.pathname]?.();

    return scheduleIdle(() => {
      ['/client', '/client/browse', '/client/bookings', '/client/glovebox'].forEach((path) => {
        if (path !== location.pathname) {
          CLIENT_MODULE_PRELOADERS[path]?.();
        }
      });
    });
  }, [location.pathname]);

  const sidebarContent = (
    <nav className="flex-1 px-4 space-y-2 overflow-y-auto pb-4 pt-2">
      {navGroups.map((group) => {
        const isExpanded = expandedGroup === group.category;
        const hasActive = group.items.some(i => i.path === location.pathname);

        return (
          <div key={group.category}>
            <button
              onClick={() => toggleGroup(group.category)}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                hasActive
                  ? 'text-primary bg-primary/5'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <span>{group.category}</span>
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="mt-1 space-y-1">
                    {group.items.map((item) => {
                      const isActive = location.pathname === item.path;
                      return (
                        <Link
                          key={item.name}
                          to={item.path}
                          onMouseEnter={() => CLIENT_MODULE_PRELOADERS[item.path]?.()}
                          onFocus={() => CLIENT_MODULE_PRELOADERS[item.path]?.()}
                          onTouchStart={() => CLIENT_MODULE_PRELOADERS[item.path]?.()}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                            isActive
                              ? 'bg-primary text-white shadow-lg shadow-primary/20'
                              : 'text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          <item.icon size={20} />
                          <span>{item.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background flex text-foreground transition-colors duration-300">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-card border-r border-border flex-col flex-shrink-0">
        <div className="min-h-16 md:min-h-20 p-6 flex items-center">
          <Logo size="lg" showText={false} />
        </div>
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobile && sidebarOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 z-40"
              onClick={() => setSidebarOpen(false)}
            />
            {/* Drawer */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed left-0 top-0 h-full w-72 bg-card border-r border-border z-50 flex flex-col shadow-2xl"
            >
              <div className="p-6 flex items-center justify-between">
                <Logo size="lg" showText={false} />
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-2 hover:bg-muted rounded-lg text-muted-foreground"
                >
                  <X size={20} />
                </button>
              </div>
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header with Hamburger */}
        <div className="flex items-center md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-4 text-muted-foreground hover:text-foreground"
            aria-label="Open sidebar"
          >
            <Menu size={24} />
          </button>
        </div>

        <PortalHeader
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          portalType="client"
        />

        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          <Suspense fallback={<LogoLoader />}>
            <Routes>
              <Route index element={<Dashboard />} />
              <Route path="browse" element={<BrowseAndBook />} />
              <Route path="bookings" element={<MyBookings />} />
              <Route path="profile" element={<MyProfile />} />
              <Route path="glovebox" element={<DigitalGlovebox />} />
              <Route path="rewards" element={<LoyaltyRewards />} />
              <Route path="inbox" element={<MyInbox />} />
              <Route path="settings" element={<Settings />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
