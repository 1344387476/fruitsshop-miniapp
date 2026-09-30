import type { State } from "./types";

export interface Repository {
  read(): Promise<State>;
  change<T>(
    update: (state: State) => T,
    images?: { id: string; blob: Blob }[],
  ): Promise<T>;
  image(id: string): Promise<Blob | undefined>;
}

// No cached state: each write reads the latest value inside the same transaction.
export function createRepository(
  seed: () => State,
  name = "baiguoji-admin-demo",
  factory: IDBFactory = indexedDB,
): Repository {
  let opening: Promise<IDBDatabase> | undefined;
  function open() {
    if (!opening) {
      opening = new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(name, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("state");
          request.result.createObjectStore("images");
        };
        request.onerror = () => {
          opening = undefined;
          reject(new Error("无法打开本地数据库，请检查浏览器存储权限后重试"));
        };
        request.onblocked = () => {
          opening = undefined;
          reject(
            new Error("数据库升级被其他标签页阻塞，请关闭旧后台页面后重试"),
          );
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            opening = undefined;
          };
          resolve(db);
        };
      }).catch((error) => {
        opening = undefined;
        throw new Error(
          error instanceof Error ? error.message : "本地数据库不可用，请重试",
        );
      });
    }
    return opening;
  }
  async function change<T>(
    update: (state: State) => T,
    images: { id: string; blob: Blob }[] = [],
  ): Promise<T> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["state", "images"], "readwrite");
      let result: T;
      let failure: unknown;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(
          failure ||
            new Error("本地保存失败，请检查可用存储空间后重试；原数据未改变"),
        );
      tx.onerror = () => {
        /* abort handles the final result, never an individual request success */
      };
      const store = tx.objectStore("state");
      const request = store.get("current");
      request.onsuccess = () => {
        try {
          const state: State =
            request.result === undefined ? seed() : request.result;
          if (!state || state.version !== 1)
            throw new Error("本地数据版本不兼容，请保留数据并联系维护者");
          result = update(state);
          // Upload references are immutable so existing order snapshots keep their original image.
          for (const image of images)
            tx.objectStore("images").add(image.blob, image.id);
          store.put(state, "current");
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
    });
  }
  return {
    change,
    async read() {
      const db = await open();
      const state = await new Promise<State | undefined>((resolve, reject) => {
        const tx = db.transaction("state", "readonly");
        const request = tx.objectStore("state").get("current");
        let value: State | undefined;
        request.onsuccess = () => {
          value = request.result;
        };
        tx.oncomplete = () => resolve(value);
        tx.onabort = () =>
          reject(new Error("本地数据读取失败，请重试；原数据未改变"));
      });
      // Only an empty database is initialized; competing initial reads still share a write transaction.
      if (state === undefined) return change((s) => structuredClone(s));
      if (!state || state.version !== 1)
        throw new Error("本地数据版本不兼容，请保留数据并联系维护者");
      return state;
    },
    async image(id) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("images", "readonly");
        const request = tx.objectStore("images").get(id);
        let result: Blob | undefined;
        request.onsuccess = () => {
          result = request.result;
        };
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(new Error("图片读取失败，请重试"));
      });
    },
  };
}
