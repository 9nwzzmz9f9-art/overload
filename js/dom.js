export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== null && value !== undefined) {
      node.setAttribute(key, value);
    }
  });
  children.forEach((child) => child && node.appendChild(child));
  return node;
}

export function clear(node) {
  node.innerHTML = "";
}

/** A small caption above a form control — see .field / .field-label in style.css. */
export function labeledField(label, input) {
  return el("label", { class: "field" }, [el("span", { class: "field-label", text: label }), input]);
}

/**
 * Renders a full-screen modal overlay. Returns a close() function.
 * @param {HTMLElement} contentNode
 */
export function openModal(contentNode) {
  const overlay = el("div", { class: "modal-overlay" }, [
    el("div", { class: "modal-sheet" }, [contentNode]),
  ]);
  document.body.appendChild(overlay);
  function close() {
    overlay.remove();
  }
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  return close;
}
