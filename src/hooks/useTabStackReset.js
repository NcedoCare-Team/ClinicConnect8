import { useEffect, useRef } from 'react';
import { CommonActions } from '@react-navigation/native';
import { usePathname, useRootNavigation, useSegments } from 'expo-router';

function findNavigatorState(state, type) {
  if (!state) return null;
  if (state.type === type) return state;
  for (const route of state.routes ?? []) {
    const found = findNavigatorState(route.state, type);
    if (found) return found;
  }
  return null;
}

function tabRootPath(tabGroup, tab, rootScreen) {
  const groupPath = tabGroup === '(app)' ? '/(app)' : `/${tabGroup}`;
  return `${groupPath}/${tab}/${rootScreen}`;
}

function wasOnSubScreen(pathname, tabGroup, tab, rootScreen) {
  const rootPath = tabRootPath(tabGroup, tab, rootScreen);
  if (pathname === rootPath) return false;
  const groupPath = tabGroup === '(app)' ? '/(app)' : `/${tabGroup}`;
  return pathname.startsWith(`${groupPath}/${tab}/`);
}

/**
 * Resets a tab's nested stack when switching to another tab.
 * Uses the root navigation ref so it works with NativeTabs (no extra tab animation).
 */
export function useTabStackReset(tabRoots, tabGroup) {
  const rootNav = useRootNavigation();
  const segments = useSegments();
  const pathname = usePathname();
  const prevTabRef = useRef(null);
  const prevPathnameRef = useRef(pathname);
  const tabNames = Object.keys(tabRoots);

  useEffect(() => {
    if (!segments.includes(tabGroup)) return;

    const currentTab = tabNames.find((tab) => segments.includes(tab));
    if (!currentTab) return;

    if (prevTabRef.current && prevTabRef.current !== currentTab && rootNav?.isReady()) {
      const prevTab = prevTabRef.current;
      const rootScreen = tabRoots[prevTab];
      const prevPath = prevPathnameRef.current;

      const tabState = findNavigatorState(rootNav.getRootState(), 'tab');
      const prevRoute = tabState?.routes.find((route) => route.name === prevTab);
      const nestedIndex = prevRoute?.state?.index ?? 0;
      const needsReset =
        nestedIndex > 0 || wasOnSubScreen(prevPath, tabGroup, prevTab, rootScreen);

      if (needsReset && tabState) {
        const routes = tabState.routes.map((route) => {
          if (route.name !== prevTab) return route;
          return {
            ...route,
            state: {
              index: 0,
              routes: [{ name: rootScreen }],
            },
          };
        });

        rootNav.dispatch({
          ...CommonActions.reset({
            ...tabState,
            routes,
            index: tabState.index,
          }),
          target: tabState.key,
        });
      }
    }

    prevTabRef.current = currentTab;
    prevPathnameRef.current = pathname;
  }, [segments, pathname, rootNav, tabGroup, tabRoots]);
}
