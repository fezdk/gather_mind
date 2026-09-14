import type { AndroidNativeProps } from '@react-native-community/datetimepicker';

type PickerMode = 'date' | 'time';
type NativePicker = {
  open: (props: AndroidNativeProps) => void;
  dismiss: (mode: PickerMode) => Promise<boolean>;
};
type AppLifecycle = {
  currentState: string | null;
  addEventListener: (event: 'change', listener: (state: string) => void) => { remove: () => void };
};

// Android owns one fragment per picker mode, shared by all editors. Serialize
// cleanup and presentation across mounts, including app-lock unmount/remount.
export function createAndroidPickerLifecycle(native: NativePicker, app: AppLifecycle) {
  let queue = Promise.resolve();
  let closeCurrent: (() => void) | null = null;

  async function dismissDialogs() {
    await native.dismiss('date');
    await native.dismiss('time');
  }

  return {
    show(props: AndroidNativeProps): () => void {
      closeCurrent?.();
      let live = true;
      let subscription: { remove: () => void } | undefined;
      const finish = () => {
        live = false;
        subscription?.remove();
        if (closeCurrent === cancel) closeCurrent = null;
      };
      const dismissed = () => props.onChange?.({
        type: 'dismissed',
        nativeEvent: { timestamp: props.value.getTime(), utcOffset: 0 },
      }, props.value);
      const cancel = (notify = true) => {
        if (!live) return;
        finish(); // Ignore the old native promise before attempting dismissal.
        queue = queue.then(dismissDialogs).catch(() => {
          // The Activity may already be stopped. Every new show retries cleanup
          // in the foreground before opening, so a stale fragment cannot win.
        });
        if (notify) dismissed();
      };
      closeCurrent = cancel;
      subscription = app.addEventListener('change', (state) => {
        if (state !== 'active') cancel();
      });
      const fail = (error: Error) => {
        if (!live) return;
        finish();
        dismissed(); // Reset the parent's open flag even on native failure.
        props.onError?.(error);
      };
      queue = queue.then(async () => {
        if (!live) return;
        if (app.currentState !== 'active') { cancel(); return; }
        await dismissDialogs();
        if (!live) return;
        if (app.currentState !== 'active') { cancel(); return; }
        native.open({
          ...props,
          onChange: (event, value) => {
            if (!live) return;
            finish();
            props.onChange?.(event, value);
          },
          onError: fail,
        });
      }).catch((error: unknown) => fail(error instanceof Error ? error : new Error(String(error))));

      return () => cancel(false);
    },
  };
}
