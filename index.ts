import { registerRootComponent } from 'expo';
import { addStartupBreadcrumb } from './src/services/sentry';
import App from './App';

// The entry marker confirms that the JavaScript bundle executed. Only a safe
// stage name is recorded.
addStartupBreadcrumb('js_entry', 'completed');

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
