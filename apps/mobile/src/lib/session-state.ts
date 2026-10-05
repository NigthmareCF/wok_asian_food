import { ApiError } from "./api-client";

export const refreshKey = "wok.refresh-token";
export const emailKey = "wok.session-email";
type Storage = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

export function createSessionState(storage: Storage) {
  let generation = 0;
  let queue: Promise<void> = Promise.resolve();
  const assert = (version: number) => {
    if (version !== generation) throw new ApiError("La sesión cambió. Vuelve a intentar desde tu cuenta actual.", 401);
  };
  function write(version: number, operation: () => Promise<void>) {
    const task = queue.catch(() => {}).then(async () => { assert(version); await operation(); });
    queue = task;
    return task.then(() => { assert(version); });
  }
  return {
    current: () => generation,
    advance: () => ++generation,
    assert,
    async read(version: number) {
      await queue.catch(() => {});
      assert(version);
      const [refreshToken, email] = await Promise.all([storage.getItemAsync(refreshKey), storage.getItemAsync(emailKey)]);
      assert(version);
      return { refreshToken, email };
    },
    save(version: number, refreshToken: string, email: string) {
      return write(version, async () => {
        try {
          await storage.setItemAsync(refreshKey, refreshToken);
          await storage.setItemAsync(emailKey, email);
        } catch (error) {
          await Promise.all([storage.deleteItemAsync(refreshKey), storage.deleteItemAsync(emailKey)]);
          throw error;
        }
      });
    },
    clear(version: number) {
      return write(version, async () => {
        await Promise.all([storage.deleteItemAsync(refreshKey), storage.deleteItemAsync(emailKey)]);
      });
    },
  };
}
