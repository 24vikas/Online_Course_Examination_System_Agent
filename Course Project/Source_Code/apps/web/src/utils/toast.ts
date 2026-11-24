/**
 * Simple, reliable event-based global toast utility
 */

export type ToastType = 'info' | 'success' | 'warning' | 'error' | 'neutral';

export interface ToastPayload {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  durationMs?: number;
}

export interface ToastOptions {
  message: string;
  type?: ToastType;
  title?: string;
  durationMs?: number;
}

export function showToast(
  messageOrOptions: string | ToastOptions,
  type: ToastType = 'info',
  durationMs = 5000,
) {
  if (typeof window === 'undefined') return;

  let message = '';
  let toastType: 'info' | 'success' | 'warning' | 'error' = 'info';
  let duration = durationMs;

  if (typeof messageOrOptions === 'object') {
    const titlePrefix = messageOrOptions.title ? `${messageOrOptions.title}: ` : '';
    message = `${titlePrefix}${messageOrOptions.message}`;
    const t = messageOrOptions.type;
    toastType = (t === 'neutral' ? 'info' : t) || 'info';
    if (messageOrOptions.durationMs) duration = messageOrOptions.durationMs;
  } else {
    message = messageOrOptions;
    toastType = type === 'neutral' ? 'info' : type;
  }

  const event = new CustomEvent<ToastPayload>('academic-app-toast', {
    detail: {
      id: `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      message,
      type: toastType,
      durationMs: duration,
    },
  });
  window.dispatchEvent(event);
}
