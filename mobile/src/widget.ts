import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import { type AppState } from './model';
import { buildWidgetSnapshot } from './widget-model';

type GatherMindWidgetNativeModule = {
  updateSnapshot(snapshot: string): Promise<void>;
  clearSnapshot(): Promise<void>;
};

const nativeWidget = Platform.OS === 'android'
  ? requireOptionalNativeModule<GatherMindWidgetNativeModule>('GatherMindWidget')
  : null;

let widgetOperationQueue: Promise<void> = Promise.resolve();

function enqueueWidgetOperation(operation: () => Promise<void>): Promise<void> {
  const queued = widgetOperationQueue.then(operation);
  widgetOperationQueue = queued.catch(() => undefined);
  return queued;
}

export async function updateWidgetSnapshot(state: AppState, showDetails: boolean): Promise<void> {
  if (!nativeWidget) return;
  const snapshot = JSON.stringify(buildWidgetSnapshot(state, showDetails));
  await enqueueWidgetOperation(() => nativeWidget.updateSnapshot(snapshot));
}

export async function clearWidgetSnapshot(): Promise<void> {
  if (!nativeWidget) return;
  await enqueueWidgetOperation(() => nativeWidget.clearSnapshot());
}
