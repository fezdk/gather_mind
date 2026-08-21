import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const APP_LOCK_SETTING = 'gather-mind-app-lock-enabled-v1';
const APP_LOCK_DELAY_SETTING = 'gather-mind-app-lock-delay-v1';
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const APP_LOCK_DELAYS_MS = [0, 60_000, 5 * 60_000, 15 * 60_000] as const;
export type AppLockDelayMs = (typeof APP_LOCK_DELAYS_MS)[number];

export type BiometricAvailability =
  | { available: true }
  | { available: false; message: string };

export async function loadAppLockEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(APP_LOCK_SETTING, SECURE_STORE_OPTIONS)) === 'true';
}

export async function saveAppLockEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(APP_LOCK_SETTING, String(enabled), SECURE_STORE_OPTIONS);
}

export async function loadAppLockDelayMs(): Promise<AppLockDelayMs> {
  const stored = Number(await SecureStore.getItemAsync(APP_LOCK_DELAY_SETTING, SECURE_STORE_OPTIONS));
  return APP_LOCK_DELAYS_MS.find((delay) => delay === stored) ?? 0;
}

export async function saveAppLockDelayMs(delayMs: AppLockDelayMs): Promise<void> {
  if (!APP_LOCK_DELAYS_MS.includes(delayMs)) throw new Error('Unsupported app lock delay.');
  await SecureStore.setItemAsync(APP_LOCK_DELAY_SETTING, String(delayMs), SECURE_STORE_OPTIONS);
}

export async function biometricAvailability(): Promise<BiometricAvailability> {
  if (!(await LocalAuthentication.hasHardwareAsync())) {
    return { available: false, message: 'This phone does not report a biometric sensor.' };
  }
  if (!(await LocalAuthentication.isEnrolledAsync())) {
    return { available: false, message: 'Add a fingerprint or face in your phone settings first.' };
  }
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (level < LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG) {
    return { available: false, message: 'Gather Mind needs a strong fingerprint or secure face unlock.' };
  }
  return { available: true };
}

export async function authenticateWithBiometrics(promptMessage = 'Unlock Gather Mind') {
  return LocalAuthentication.authenticateAsync({
    promptMessage,
    promptSubtitle: 'Your thoughts stay private on this phone',
    cancelLabel: 'Not now',
    fallbackLabel: 'Use device passcode',
    disableDeviceFallback: false,
    biometricsSecurityLevel: 'strong',
  });
}

export function authenticationErrorMessage(error: LocalAuthentication.LocalAuthenticationError): string {
  switch (error) {
    case 'not_enrolled':
      return 'No strong fingerprint or face is enrolled. Add one in your phone settings, then try again.';
    case 'not_available':
      return 'Biometric unlock is not available on this phone.';
    case 'lockout':
      return 'Biometric unlock is temporarily locked. Unlock your phone normally, then try again.';
    case 'passcode_not_set':
      return 'Set a screen lock on your phone, then try again.';
    case 'user_cancel':
    case 'app_cancel':
    case 'system_cancel':
      return 'Gather Mind is still locked.';
    default:
      return 'Your phone could not verify you. Try again.';
  }
}
