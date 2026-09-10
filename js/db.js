// IndexedDB schema + low-level access. No UI code should touch this
// module directly — go through repository.js instead.

const DB_NAME = "overload";
const DB_VERSION = 2;

/** @type {Promise<IDBDatabase>|null} */
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Every store creation is guarded by `contains()` so this function
    // stays safe to re-run on every future version bump — onupgradeneeded
    // fires this whole handler again for anyone upgrading from an older
    // version, and re-creating an existing store throws.
    request.onupgradeneeded = (event) => {
      const db = request.result;

      if (!db.objectStoreNames.contains("exercises")) {
        const exercises = db.createObjectStore("exercises", { keyPath: "id" });
        exercises.createIndex("isArchived", "isArchived", { unique: false });
      }

      if (!db.objectStoreNames.contains("routines")) {
        db.createObjectStore("routines", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("routineBlocks")) {
        const routineBlocks = db.createObjectStore("routineBlocks", { keyPath: "id" });
        routineBlocks.createIndex("routineId", "routineId", { unique: false });
        routineBlocks.createIndex("routineLocation", ["routineId", "location"], { unique: false });
      }

      if (!db.objectStoreNames.contains("setTargets")) {
        const setTargets = db.createObjectStore("setTargets", { keyPath: "id" });
        setTargets.createIndex("exerciseId", "exerciseId", { unique: false });
        setTargets.createIndex(
          "exerciseLocationSet",
          ["exerciseId", "location", "setNumber"],
          { unique: true }
        );
      }

      if (!db.objectStoreNames.contains("appSettings")) {
        db.createObjectStore("appSettings", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("scheduledWorkouts")) {
        const scheduledWorkouts = db.createObjectStore("scheduledWorkouts", { keyPath: "id" });
        scheduledWorkouts.createIndex("date", "date", { unique: false });
      }

      if (!db.objectStoreNames.contains("workouts")) {
        const workouts = db.createObjectStore("workouts", { keyPath: "id" });
        workouts.createIndex("date", "date", { unique: false });
        workouts.createIndex("status", "status", { unique: false });
      }

      if (!db.objectStoreNames.contains("loggedSets")) {
        const loggedSets = db.createObjectStore("loggedSets", { keyPath: "id" });
        loggedSets.createIndex("workoutId", "workoutId", { unique: false });
        loggedSets.createIndex("exerciseId", "exerciseId", { unique: false });
      }

      if (!db.objectStoreNames.contains("progressionEvents")) {
        const progressionEvents = db.createObjectStore("progressionEvents", { keyPath: "id" });
        progressionEvents.createIndex("exerciseId", "exerciseId", { unique: false });
        progressionEvents.createIndex("workoutId", "workoutId", { unique: false });
      }

      if (!db.objectStoreNames.contains("plateProfiles")) {
        const plateProfiles = db.createObjectStore("plateProfiles", { keyPath: "id" });
        plateProfiles.createIndex("location", "location", { unique: true });
      }

      // v2: Programs (user feedback) — an ordered grouping of existing
      // routines (e.g. "Winter Bulk" containing Upper/Lower/Push/Pull).
      // Purely additive: membership only (`routineIds`), no ownership of
      // the routine records themselves, so it never touches how
      // routines/blocks/set targets already work.
      if (!db.objectStoreNames.contains("programs")) {
        db.createObjectStore("programs", { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

/**
 * @param {string} storeName
 * @param {"readonly"|"readwrite"} mode
 * @returns {Promise<IDBObjectStore>}
 */
async function getStore(storeName, mode) {
  const db = await openDb();
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const db = {
  async getAll(storeName) {
    const store = await getStore(storeName, "readonly");
    return wrap(store.getAll());
  },

  async get(storeName, id) {
    const store = await getStore(storeName, "readonly");
    return wrap(store.get(id));
  },

  async getAllByIndex(storeName, indexName, query) {
    const store = await getStore(storeName, "readonly");
    return wrap(store.index(indexName).getAll(query));
  },

  async put(storeName, record) {
    const store = await getStore(storeName, "readwrite");
    return wrap(store.put(record));
  },

  async delete(storeName, id) {
    const store = await getStore(storeName, "readwrite");
    return wrap(store.delete(id));
  },

  async count(storeName) {
    const store = await getStore(storeName, "readonly");
    return wrap(store.count());
  },

  async clear(storeName) {
    const store = await getStore(storeName, "readwrite");
    return wrap(store.clear());
  },
};

export function newId() {
  // crypto.randomUUID() only exists in secure contexts (https, or
  // literally "localhost"). Testing over plain http on a LAN IP (e.g.
  // opening the dev server's address from a phone) is not a secure
  // context, so fall back to building a v4 UUID from getRandomValues,
  // which works everywhere.
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
