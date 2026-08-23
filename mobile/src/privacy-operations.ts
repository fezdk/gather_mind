export type AppVisibility = 'active' | 'background' | 'inactive' | 'unknown' | 'extension';

type AuthenticationCompletion = {
  authenticated: boolean;
  appState: AppVisibility;
  attemptId: number;
  currentAttemptId: number;
  generation: number;
  currentGeneration: number;
  mounted: boolean;
  sawBackground: boolean;
};

export function authenticationCanComplete({
  authenticated,
  appState,
  attemptId,
  currentAttemptId,
  generation,
  currentGeneration,
  mounted,
  // A secure Android device-credential fallback may briefly own a separate
  // activity. A background transition is therefore safe only after a
  // successful authentication has returned and Gather Mind is active again.
  sawBackground: _sawBackground,
}: AuthenticationCompletion): boolean {
  return authenticated
    && mounted
    && appState === 'active'
    && attemptId === currentAttemptId
    && generation === currentGeneration;
}

type AutomaticUnlockRequest = {
  appState: AppVisibility;
  lockEnabled: boolean;
  lockStatus: 'checking' | 'locked' | 'unlocking' | 'unlocked';
  authenticating: boolean;
  attempted: boolean;
};

export function automaticUnlockShouldStart({
  appState,
  lockEnabled,
  lockStatus,
  authenticating,
  attempted,
}: AutomaticUnlockRequest): boolean {
  return appState === 'active'
    && lockEnabled
    && lockStatus === 'locked'
    && !authenticating
    && !attempted;
}

type NotificationCleanup = {
  cancelScheduled: () => Promise<void>;
  dismissDelivered: () => Promise<void>;
  clearLastResponse: () => void | Promise<void>;
};

type ReminderCleanup = Omit<NotificationCleanup, 'clearLastResponse'>;

async function runCleanupOperations(operations: Array<() => void | Promise<void>>): Promise<unknown[]> {
  const errors: unknown[] = [];
  for (const operation of operations) {
    try {
      await operation();
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

export async function clearPrivateNotifications({
  cancelScheduled,
  dismissDelivered,
  clearLastResponse,
}: NotificationCleanup): Promise<unknown[]> {
  return runCleanupOperations([cancelScheduled, dismissDelivered, clearLastResponse]);
}

export async function removePrivateReminder({
  cancelScheduled,
  dismissDelivered,
}: ReminderCleanup): Promise<void> {
  const errors = await runCleanupOperations([cancelScheduled, dismissDelivered]);
  if (errors.length) throw errors[0];
}

export async function runAfterReminderCancellation<T>(
  notificationId: string | null | undefined,
  cancel: (id: string) => Promise<void>,
  operation: () => Promise<T> | T,
): Promise<T> {
  if (notificationId) await cancel(notificationId);
  return operation();
}

export function settingChangeStayedForeground(
  appState: AppVisibility,
  backgroundEpochAfterAuthentication: number,
  currentBackgroundEpoch: number,
): boolean {
  return appState === 'active' && backgroundEpochAfterAuthentication === currentBackgroundEpoch;
}

export function awayDurationRequiresLock(backgroundedAt: number, now: number, delayMs: number): boolean {
  return now - backgroundedAt >= Math.max(0, delayMs);
}
