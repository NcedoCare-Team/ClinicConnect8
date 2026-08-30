import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Native bottom tab bar height (matches NativeTabs). */
export const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 88 : 68;

/** Scroll/list padding so content clears the tab bar on nested screens. */
export function getStackScrollBottomInset(safeBottom = 0, extra = 16) {
  return TAB_BAR_HEIGHT + safeBottom + extra;
}

/** Bottom inset for fixed input bars above the tab bar. */
export function getInputBarBottomInset(safeBottom = 0, extra = 8) {
  return TAB_BAR_HEIGHT + safeBottom + extra;
}

export function useStackScrollBottomInset(extra = 16) {
  const insets = useSafeAreaInsets();
  return getStackScrollBottomInset(insets.bottom, extra);
}

export function useInputBarBottomInset(extra = 8) {
  const insets = useSafeAreaInsets();
  return getInputBarBottomInset(insets.bottom, extra);
}
