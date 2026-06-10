import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  Car,
  Wrench,
  AlertTriangle,
  DollarSign,
  Receipt,
  Inbox,
  CalendarCheck,
  FileText,
  TrendingUp,
  Settings as SettingsIcon,
  Menu,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  PenTool
} from 'lucide-react';
import { Logo } from '../shared/Logo';
import { PortalHeader } from '../PortalHeader';

const importFleetDashboard = () => import('./FleetDashboard');
const importMyCars = () => import('./MyCars');
const importMyInbox = () => import('./MyInbox');
const importExpenseTracker = () => import('./ExpenseTracker');
const importBookingRequests = () => import('./BookingRequests');
const importDigitalVault = () => import('./DigitalVault');
const importGrowthAndInsights = () => import('./GrowthAndInsights');
const importMaintenanceLogs = () => import('./MaintenanceLogs');
const importDamageReports = () => import('./DamageReports');
const importFinancialCenter = () => import('./FinancialCenter');
const importFleetSettings = () => import('./FleetSettings');
const importFleetConciergeBooking = () => import('./FleetConciergeBooking');

const FleetDashboard = React.lazy(() => importFleetDashboard().then(m => ({ default: m.FleetDashboard })));
const MyCars = React.lazy(() => importMyCars().then(m => ({ default: m.MyCars })));
const MyInbox = React.lazy(() => importMyInbox().then(m => ({ default: m.MyInbox })));
const ExpenseTracker = React.lazy(() => importExpenseTracker().then(m => ({ default: m.ExpenseTracker })));
const BookingRequests = React.lazy(() => importBookingRequests().then(m => ({ default: m.BookingRequests })));
const DigitalVault = React.lazy(() => importDigitalVault().then(m => ({ default: m.DigitalVault })));
const GrowthAndInsights = React.lazy(() => importGrowthAndInsights().then(m => ({ default: m.GrowthAndInsights })));
const MaintenanceLogs = React.lazy(() => importMaintenanceLogs().then(m => ({ default: m.default })));
const DamageReports = React.lazy(() => importDamageReports().then(m => ({ default: m.default })));
const FinancialCenter = React.lazy(() => importFinancialCenter().then(m => ({ default: m.FinancialCenter })));
const FleetSettings = React.lazy(() => importFleetSettings().then(m => ({ default: m.FleetSettings })));
const FleetConciergeBooking = React.lazy(() => importFleetConciergeBooking().then(m => ({ default: m.FleetConciergeBooking })));

const FLEET_MODULE_PRELOADERS: Record<string, () => Promise<unknown>> = {
  '/fleet': importFleetDashboard,
  '/fleet/cars': importMyCars,
  '/fleet/maintenance': importMaintenanceLogs,
  '/fleet/damage': importDamageReports,
  '/fleet/financials': importFinancialCenter,
  '/fleet/expenses': importExpenseTracker,
  '/fleet/inbox': importMyInbox,
  '/fleet/booking-requests': importBookingRequests,
  '/fleet/concierge-booking': importFleetConciergeBooking,
  '/fleet/vault': importDigitalVault,
  '/fleet/growth': importGrowthAndInsights,
  '/fleet/settings': importFleetSettings,
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
    category: 'Strategic Dashboard',
    items: [
      { name: 'Dashboard', path: '/fleet', icon: LayoutDashboard }
    ]
  },
  {
    category: 'Fleet Management',
    items: [
      { name: 'My Cars', path: '/fleet/cars', icon: Car },
      { name: 'Maintenance Logs', path: '/fleet/maintenance', icon: Wrench },
      { name: 'Damage Reports', path: '/fleet/damage', icon: AlertTriangle },
    ]
  },
  {
    category: 'Financials',
    items: [
      { name: 'Earnings & Payouts', path: '/fleet/financials', icon: DollarSign },
      { name: 'Expense Tracker', path: '/fleet/expenses', icon: Receipt },
    ]
  },
  {
    category: 'Operations & Communication',
    items: [
      { name: 'Field Booking', path: '/fleet/concierge-booking', icon: PenTool },
      { name: 'My Inbox', path: '/fleet/inbox', icon: Inbox },
      { name: 'Booking Requests', path: '/fleet/booking-requests', icon: CalendarCheck },
      { name: 'Digital Vault', path: '/fleet/vault', icon: FileText },
    ]
  },
  {
    category: 'Growth & Optimization',
    items: [
      { name: 'Growth & Insights', path: '/fleet/growth', icon: TrendingUp },
    ]
  },
  {
    category: 'Account Settings',
    items: [
      { name: 'Settings', path: '/fleet/settings', icon: SettingsIcon },
    ]
  }
];

export function FleetLayout() {
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const isDarkMode = theme === 'dark';
  const setIsDarkMode = (isDark: boolean) => setTheme(isDark ? 'dark' : 'light');

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(() => {
    const active = navGroups.find(g => g.items.some(i => i.path === location.pathname));
    return active?.category ?? 'Strategic Dashboard';
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
    setExpandedGroup(prev => prev === category ? null : category);
  }, []);

  useEffect(() => {
    FLEET_MODULE_PRELOADERS[location.pathname]?.();

    return scheduleIdle(() => {
      ['/fleet', '/fleet/cars', '/fleet/financials', '/fleet/booking-requests', '/fleet/inbox'].forEach((path) => {
        if (path !== location.pathname) {
          FLEET_MODULE_PRELOADERS[path]?.();
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
                          onMouseEnter={() => FLEET_MODULE_PRELOADERS[item.path]?.()}
                          onFocus={() => FLEET_MODULE_PRELOADERS[item.path]?.()}
                          onTouchStart={() => FLEET_MODULE_PRELOADERS[item.path]?.()}
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
          portalType="fleet"
        />

        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-primary" size={32} /></div>}>
            <Routes>
              <Route index element={<FleetDashboard />} />
              <Route path="cars" element={<MyCars />} />
              <Route path="maintenance" element={<MaintenanceLogs />} />
              <Route path="damage" element={<DamageReports />} />
              <Route path="financials" element={<FinancialCenter />} />
              <Route path="expenses" element={<ExpenseTracker />} />
              <Route path="inbox" element={<MyInbox />} />
              <Route path="booking-requests" element={<BookingRequests />} />
              <Route path="concierge-booking" element={<FleetConciergeBooking />} />
              <Route path="vault" element={<DigitalVault />} />
              <Route path="growth" element={<GrowthAndInsights />} />
              <Route path="settings" element={<FleetSettings />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
