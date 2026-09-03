const databaseName = "sound-explorer";
const storeName = "environments";

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("Storage is unavailable"));
      return;
    }

    const request = window.indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Storage is unavailable"));
  });
}

function useEnvironmentStore(mode, action) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      database.close();
      callback(value);
    };

    let result;
    try {
      const transaction = database.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => finish(reject, request.error || new Error("Unable to save on this device"));
      transaction.oncomplete = () => finish(resolve, result);
      transaction.onerror = () => finish(reject, transaction.error || new Error("Unable to save on this device"));
      transaction.onabort = () => finish(reject, transaction.error || new Error("Unable to save on this device"));
    } catch (error) {
      finish(reject, error);
    }
  }));
}

export const environmentStorage = {
  list: () => useEnvironmentStore("readonly", (store) => store.getAll()),
  save: (environment) => useEnvironmentStore("readwrite", (store) => store.put(environment)),
};
