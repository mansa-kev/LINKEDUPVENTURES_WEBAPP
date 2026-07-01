import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { analyticsService } from '../../services/analyticsService';

export function AnalyticsTracker() {
  const location = useLocation();
  const currentPathRef = useRef(location.pathname);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    // When location changes, calculate time spent on the previous page
    const newPath = location.pathname;
    
    if (newPath !== currentPathRef.current) {
      const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);
      
      // Log the time spent on the previous page before changing
      analyticsService.trackEvent('page_leave', 'time_spent', {
        page_url: currentPathRef.current,
        time_spent_seconds: timeSpent
      });

      // Reset for the new page
      currentPathRef.current = newPath;
      startTimeRef.current = Date.now();
      
      // Track the new page view
      analyticsService.trackEvent('page_view', 'load', {
        page_url: newPath
      });
    }
  }, [location.pathname]);

  // Initial load tracking
  useEffect(() => {
    analyticsService.trackEvent('page_view', 'initial_load', {
      page_url: location.pathname
    });

    // Cleanup on unmount (e.g., closing tab)
    return () => {
      const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);
      analyticsService.trackEvent('page_leave', 'time_spent', {
        page_url: currentPathRef.current,
        time_spent_seconds: timeSpent
      });
    };
  }, []);

  return null;
}
