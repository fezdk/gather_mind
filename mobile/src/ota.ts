import { isReleaseNewer } from './updates';
import type { ReloadScreenOptions } from 'expo-updates';

// Native UI survives replacement of the JavaScript runtime. No remote image.
export function otaReloadScreenOptions(backgroundColor: string, accentColor: string, reduceMotion: boolean): ReloadScreenOptions {
  return { backgroundColor, fade: !reduceMotion, spinner: { enabled: !reduceMotion, color: accentColor, size: 'medium' } };
}

export type OtaCandidate = { id: string; version: string };
export function compatibleOtaCandidate(manifest: unknown, runtime: string | null, installed: string): OtaCandidate | null {
  if (!manifest || typeof manifest !== 'object') return null;
  const value = manifest as { id?: unknown; runtimeVersion?: unknown; metadata?: { appVersion?: unknown } };
  const version = value.metadata?.appVersion;
  if (typeof value.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id)
    || !runtime || value.runtimeVersion !== runtime || typeof version !== 'string'
    || !isReleaseNewer(version, installed)) return null;
  return { id: value.id, version };
}

export type OtaEngine = {
  isEnabled: boolean;
  runtimeVersion: string | null;
  checkForUpdateAsync(): Promise<{ isAvailable: boolean; manifest?: unknown }>;
  fetchUpdateAsync(): Promise<{ isNew: boolean; manifest?: unknown }>;
  reloadAsync(): Promise<void>;
};

// Nothing starts a connection merely by importing this module.
export async function findOtaUpdate(engine: OtaEngine, installed: string): Promise<OtaCandidate | null> {
  if (!engine.isEnabled) throw new Error('A native release build is needed for in-app updates.');
  const result = await engine.checkForUpdateAsync();
  return result.isAvailable ? compatibleOtaCandidate(result.manifest, engine.runtimeVersion, installed) : null;
}

export async function downloadOtaUpdate(engine: OtaEngine, installed: string): Promise<OtaCandidate> {
  if (!engine.isEnabled) throw new Error('In-app updates are unavailable in this build.');
  const result = await engine.fetchUpdateAsync();
  const candidate = compatibleOtaCandidate(result.manifest, engine.runtimeVersion, installed);
  if (!candidate) throw new Error('No compatible newer update was downloaded.');
  return candidate;
}

export async function restartOtaSafely(operations: {
  waitForMutations: () => Promise<void>;
  canRestart: () => boolean;
  saveCurrentState: () => Promise<void>;
  saveDraft: () => Promise<void>;
  prepareReload?: () => Promise<void>;
  reload: () => Promise<void>;
}): Promise<boolean> {
  await operations.waitForMutations();
  if (!operations.canRestart()) return false;
  if (operations.prepareReload) {
    await operations.prepareReload();
    // The user may leave/lock the app or finish another edit during the transition.
    await operations.waitForMutations();
    if (!operations.canRestart()) return false;
  }
  await operations.saveCurrentState();
  await operations.saveDraft();
  if (!operations.canRestart()) return false;
  await operations.reload();
  return true;
}
