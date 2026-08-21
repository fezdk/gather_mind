import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App)
// and prepares the native runtime. Gather Mind requires a native build because
// its SQLCipher database is not available in Expo Go.
registerRootComponent(App);
