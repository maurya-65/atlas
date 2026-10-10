// The page where the user adds the address of their Atlas (for example a hosted copy). Each address gets
// its own Chrome permission prompt; background.js then injects the Atlas script on it.

const { normalizeOrigin, isLocalOrigin } = self.AtlasOrigins;
const form = document.getElementById("add");
const input = document.getElementById("address");
const statusEl = document.getElementById("status");
const list = document.getElementById("list");

function say(text, error = false) {
  statusEl.textContent = text;
  statusEl.className = error ? "error" : "";
}

async function stored() {
  const { atlasOrigins } = await chrome.storage.local.get("atlasOrigins");
  return Array.isArray(atlasOrigins) ? atlasOrigins : [];
}

async function render() {
  list.replaceChildren();
  const always = document.createElement("li");
  always.innerHTML = "<span>localhost <small>(always on)</small></span>";
  list.append(always);
  for (const origin of await stored()) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = origin;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => removeOrigin(origin));
    li.append(name, remove);
    list.append(li);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const origin = normalizeOrigin(input.value);
  if (!origin) return say("That doesn't look like an Atlas address. Use the https:// address of your hosted Atlas, for example https://your-atlas.vercel.app.", true);
  if (isLocalOrigin(origin)) return say("localhost already works. Nothing to add.");
  // The permission request has to come straight from the click, before anything else is awaited.
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: [origin + "/*"] });
  } catch (e) {
    return say(`Chrome couldn't ask for access: ${e.message || e}`, true);
  }
  if (!granted) return say("Not added: you didn't allow access to that address.", true);
  const all = await stored();
  if (!all.includes(origin)) await chrome.storage.local.set({ atlasOrigins: [...all, origin] });
  input.value = "";
  say(`Added ${origin}. Reload your Atlas tab, then use “Deep research in Claude”.`);
  render();
});

async function removeOrigin(origin) {
  await chrome.storage.local.set({ atlasOrigins: (await stored()).filter((o) => o !== origin) });
  await chrome.permissions.remove({ origins: [origin + "/*"] }).catch(() => {});
  say(`Removed ${origin}.`);
  render();
}

render();
