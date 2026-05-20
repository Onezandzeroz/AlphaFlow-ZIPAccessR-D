'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { WifiOff } from 'lucide-react';
import { useTranslation } from '@/lib/use-translation';

export function OfflineNotice() {
  const { t } = useTranslation();

  // Use useSyncExternalStore for hydration-safe online status
  const isOffline = useSyncExternalStore(
    (callback) => {
      window.addEventListener('online', callback);
      window.addEventListener('offline', callback);
      return () => {
        window.removeEventListener('online', callback);
        window.removeEventListener('offline', callback);
      };
    },
    () => !navigator.onLine,
    () => false // server snapshot - always assume online
  );

  useEffect(() => {
    if (isOffline) {
      toast.warning(t('offlineTitle'), {
        description: t('offlineDescription'),
        icon: <WifiOff className="h-4 w-4" />,
        duration: Infinity,
        id: 'offline-notice',
      });
    } else {
      toast.success(t('onlineTitle'), {
        description: t('onlineDescription'),
        duration: 3000,
        id: 'online-notice',
      });
      toast.dismiss('offline-notice');
    }
  }, [isOffline, t]);

  if (!isOffline) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-white text-center text-sm py-2 px-4 flex items-center justify-center gap-2"
      role="alert"
      aria-live="assertive"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>{t('offlineBanner')}</span>
    </div>
  );
}
