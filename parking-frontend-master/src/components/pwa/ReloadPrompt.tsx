import { useRegisterSW } from 'virtual:pwa-register/react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * Registers the service worker and, when a new build is available, asks before
 * reloading -- an unprompted refresh would wipe a half-filled session or
 * billing form.
 */
export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // Long-lived tabs (a dashboard left open all day) would otherwise never
      // notice a deploy. Check hourly.
      if (registration) {
        setInterval(() => void registration.update(), 60 * 60 * 1000);
      }
    },
  });

  if (!offlineReady && !needRefresh) return null;

  const dismiss = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <Card className="fixed bottom-4 left-4 z-50 max-w-sm shadow-lg">
      <CardContent className="flex flex-col gap-3 py-4">
        <p className="text-sm text-foreground">
          {needRefresh
            ? 'A new version of the parking app is available.'
            : 'The app is ready to work offline.'}
        </p>
        <div className="flex gap-2">
          {needRefresh && (
            <Button size="sm" onClick={() => void updateServiceWorker(true)}>
              Reload
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={dismiss}>
            {needRefresh ? 'Later' : 'Dismiss'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
