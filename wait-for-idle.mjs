export async function waitForIdle() {
  if (window.requestIdleCallback) {
    return new Promise(resolve => requestIdleCallback(resolve));
  }

  return new Promise(resolve => setTimeout(resolve, 1000));
}
