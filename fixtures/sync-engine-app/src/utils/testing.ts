export function setupTestDb() {
  return {};
}

export function setupSyncTest() {
  const calls: string[] = [];
  return {
    calls,
    emit(action: string) {
      calls.push(action);
    }
  };
}
