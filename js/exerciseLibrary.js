// Read-only reference data bundled at build time (SPEC.md §6.2). Never
// fetched at runtime beyond the initial static load, never mutated.

let libraryPromise = null;

function loadLibrary() {
  if (!libraryPromise) {
    libraryPromise = fetch("js/data/exercise-library.json").then((res) => res.json());
  }
  return libraryPromise;
}

export const exerciseLibrary = {
  async search(query, { equipmentCategory = null, muscle = null } = {}) {
    const all = await loadLibrary();
    const q = query.trim().toLowerCase();
    return all.filter((entry) => {
      if (q && !entry.name.toLowerCase().includes(q)) return false;
      if (equipmentCategory && entry.equipmentCategory !== equipmentCategory) return false;
      if (muscle && !entry.primaryMuscles.includes(muscle)) return false;
      return true;
    });
  },

  async allMuscles() {
    const all = await loadLibrary();
    const set = new Set();
    all.forEach((e) => e.primaryMuscles.forEach((m) => set.add(m)));
    return [...set].sort();
  },
};
