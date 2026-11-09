import { useState, useEffect } from 'react';

export interface BreakpointState {
  xs: boolean;
  sm: boolean;
  md: boolean;
  lg: boolean;
  xl: boolean;
  xxl: boolean;
  isMobile: boolean;
}

function getBreakpoints(): BreakpointState {
  if (typeof window === 'undefined') {
    return {
      xs: false,
      sm: true,
      md: true,
      lg: true,
      xl: true,
      xxl: false,
      isMobile: false,
    };
  }

  const w = window.innerWidth;
  return {
    xs: w < 576,
    sm: w >= 576,
    md: w >= 768,
    lg: w >= 992,
    xl: w >= 1200,
    xxl: w >= 1600,
    isMobile: w < 576,
  };
}

export function useResponsive(): BreakpointState {
  const [screens, setScreens] = useState<BreakpointState>(getBreakpoints);

  useEffect(() => {
    function handleResize() {
      const next = getBreakpoints();
      setScreens((prev) => {
        if (
          prev.xs === next.xs &&
          prev.sm === next.sm &&
          prev.md === next.md &&
          prev.lg === next.lg &&
          prev.xl === next.xl &&
          prev.xxl === next.xxl &&
          prev.isMobile === next.isMobile
        ) {
          return prev;
        }
        return next;
      });
    }

    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return screens;
}
