import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSubdomain, Subdomain } from '../../contexts/SubdomainContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'fleet_owner' | 'client' | 'driver';
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const { setPreviewSubdomain } = useSubdomain();
  const location = useLocation();

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin w-8 h-8 text-primary" />
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    const isDriversSubdomain = window.location.hostname.startsWith('drivers.');
    const loginPath = (requiredRole === 'driver' && !isDriversSubdomain) ? '/driver/login' : '/login';
    return <Navigate to={loginPath} state={{ from: location }} replace />;
  }

  // Check role-based access if requiredRole is specified
  // Strict role enforcement - no bypass for any role
  if (requiredRole && profile?.role !== requiredRole) {
    // Redirect to appropriate portal based on user role
    const userRole = profile?.role || 'client';
    const targetSubdomain: Subdomain = userRole === 'admin' ? 'admin' :
                        userRole === 'fleet_owner' ? 'fleet' :
                        userRole === 'driver' ? 'drivers' :
                        'app'; 
    const redirectPath = userRole === 'admin' ? '/admin' :
                        userRole === 'fleet_owner' ? '/fleet' :
                        userRole === 'driver' ? '/' :
                        '/client';

    // Switch subdomain context first to prevent infinite redirect loop
    // (without this, the current portal's catch-all route sends us right back)
    setPreviewSubdomain(targetSubdomain);

    return <Navigate to={redirectPath} replace />;
  }

  // User is authenticated and has correct role
  return <>{children}</>;
}
