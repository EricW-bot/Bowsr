let settingsVersion = 0;
const listeners = new Set<() => void>();

export function getSettingsVersion() {
  return settingsVersion;
}

export function subscribeSettingsVersion(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function bumpSettingsVersion() {
  settingsVersion += 1;
  listeners.forEach((listener) => listener());
}
