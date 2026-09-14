import NativeDateTimePicker, { DateTimePickerAndroid, type AndroidNativeProps } from '@react-native-community/datetimepicker';
import { useEffect, useRef, type ComponentProps } from 'react';
import { AppState, Platform } from 'react-native';
import { createAndroidPickerLifecycle } from './android-picker-lifecycle';

const androidPicker = createAndroidPickerLifecycle(DateTimePickerAndroid, AppState);

function AndroidPicker(props: AndroidNativeProps) {
  const latest = useRef(props);
  latest.current = props;
  const mode = props.mode ?? 'date';
  useEffect(() => androidPicker.show({
    ...latest.current,
    mode,
    onChange: (event, value) => latest.current.onChange?.(event, value),
    onError: (error) => {
      console.warn('Could not show the date/time picker', error);
      latest.current.onError?.(error);
    },
  }), [mode]);
  // A parent's inline onChange gets a new identity on every render. It must
  // not reopen or replace an in-progress Android dialog. All Android callers
  // close the picker on selection and mount a new session for the next tap.
  return null;
}

export default function DateTimePicker(props: ComponentProps<typeof NativeDateTimePicker>) {
  if (Platform.OS === 'android') return <AndroidPicker {...props as AndroidNativeProps} />;
  return <NativeDateTimePicker {...props} />;
}
