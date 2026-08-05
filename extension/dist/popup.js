(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // extension/lib/vault.js
  function db() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGet(key) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const req = d.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function native(message) {
    return browser.runtime.sendNativeMessage("com.diklein.intake", message);
  }
  async function nativeGetVault() {
    try {
      const r = await native({ action: "get-vault" });
      return r && r.name ? { native: true, name: r.name, path: r.path } : null;
    } catch {
      return null;
    }
  }
  async function nativeWriteFile(relPath, data, overwrite) {
    const message = { action: "write-file", relPath, overwrite };
    if (typeof data === "string") {
      message.text = data;
    } else {
      const buf = await data.arrayBuffer();
      let s = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 32768) {
        s += String.fromCharCode(...bytes.subarray(i, i + 32768));
      }
      message.b64 = btoa(s);
    }
    const r = await native(message);
    if (!r || r.error) throw new Error(r?.error || "native write failed");
    return r.written;
  }
  async function getVault() {
    if (!hasNativeVaultAccess) return nativeGetVault();
    return await idbGet("vault") ?? null;
  }
  async function ensurePermission(handle, { request = true } = {}) {
    if (!handle) return false;
    if (handle.native) return true;
    if (await handle.queryPermission({ mode: "readwrite" }) === "granted") return true;
    if (!request) return false;
    return await handle.requestPermission({ mode: "readwrite" }) === "granted";
  }
  async function writeFile(root, relPath, data, { overwrite = false } = {}) {
    if (root.native) return nativeWriteFile(relPath, data, overwrite);
    const parts = relPath.split("/").filter(Boolean);
    let name = parts.pop();
    let dir = root;
    for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
    if (!overwrite) name = await uniquify(dir, name);
    const fileHandle = await dir.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
    return [...parts, name].join("/");
  }
  async function uniquify(dir, name) {
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    let candidate = name;
    for (let n = 2; ; n++) {
      try {
        await dir.getFileHandle(candidate);
        candidate = `${base}-${n}${ext}`;
      } catch {
        return candidate;
      }
    }
  }
  var DB_NAME, STORE, hasNativeVaultAccess;
  var init_vault = __esm({
    "extension/lib/vault.js"() {
      DB_NAME = "intake";
      STORE = "handles";
      hasNativeVaultAccess = typeof window.showDirectoryPicker === "function";
    }
  });

  // extension/lib/settings.js
  async function getSettings() {
    const stored = await chrome.storage.sync.get(DEFAULTS);
    return { ...DEFAULTS, ...stored };
  }
  var DEFAULTS;
  var init_settings = __esm({
    "extension/lib/settings.js"() {
      DEFAULTS = {
        notesFolder: "",
        // vault-relative; '' = vault root
        attachmentsFolder: "attachments",
        fileExtension: ".md",
        filenameTemplate: "{title}",
        frontmatterTemplate: [
          "---",
          'title: "{title}"',
          "source: {url}",
          "date: {date}",
          "tags: [{tags}]",
          "---",
          "",
          ""
        ].join("\n"),
        openInObsidian: true
      };
    }
  });

  // extension/lib/template.js
  function expand(template, ctx) {
    const now = /* @__PURE__ */ new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const tokens = {
      title: ctx.title ?? "",
      url: ctx.url ?? "",
      domain: safeDomain(ctx.url),
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
      tags: (ctx.tags ?? []).map((t) => JSON.stringify(t)).join(", ")
    };
    return template.replace(/\{(\w+)\}/g, (m, key) => key in tokens ? tokens[key] : m);
  }
  function safeDomain(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }
  function sanitizeFilename(name) {
    return name.replace(/[/\\:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Untitled";
  }
  var init_template = __esm({
    "extension/lib/template.js"() {
    }
  });

  // extension/popup/popup.js
  var require_popup = __commonJS({
    "extension/popup/popup.js"() {
      init_vault();
      init_settings();
      init_template();
      var pageData = { url: "", title: "", selection: "", images: [] };
      var selectedImageSrc = null;
      var vaultHandle = null;
      var activeTabId = null;
      var $ = (id) => document.getElementById(id);
      function sendMessage(tabId, message, timeoutMs) {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
          chrome.tabs.sendMessage(tabId, message, (response) => {
            clearTimeout(timer);
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(response);
          });
        });
      }
      function pageProbe() {
        const selection = String(window.getSelection() || "").trim();
        const images = Array.from(document.images).filter((img) => {
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          return w > 80 && h > 80 && img.src && !img.src.startsWith("data:");
        }).map((img) => ({ src: img.src, alt: img.alt || "" })).slice(0, 24);
        return { url: location.href, title: document.title, selection, images };
      }
      async function init() {
        getVault().then((handle) => {
          vaultHandle = handle;
          if (!handle) {
            $("main").hidden = true;
            $("setup").hidden = false;
            $("setup-btn").addEventListener("click", () => chrome.runtime.openOptionsPage());
          }
        });
        const probePromise = chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
          activeTabId = tab.id;
          if (tab.title) $("title-input").value = tab.title;
          try {
            const result = await sendMessage(tab.id, { type: "PROBE" }, 250);
            if (result) return result;
          } catch {
          }
          try {
            const [{ result }] = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: pageProbe
            });
            if (result) return result;
          } catch {
          }
          return { url: tab.url || "", title: tab.title || "", selection: "", images: [] };
        });
        pageData = await probePromise;
        render();
      }
      function render() {
        if (pageData.selection) {
          $("text-input").value = pageData.selection;
          $("article-btn").hidden = true;
        }
        $("title-input").value = pageData.title || "";
        const grid = $("image-grid");
        if (!pageData.images.length) return;
        $("section-image").hidden = false;
        $("image-count").textContent = `${pageData.images.length} found`;
        for (const img of pageData.images) {
          const thumb = document.createElement("div");
          thumb.className = "image-thumb";
          const el = document.createElement("img");
          el.src = img.src;
          el.alt = img.alt;
          el.draggable = false;
          el.onerror = () => thumb.remove();
          thumb.appendChild(el);
          thumb.addEventListener("click", () => {
            const was = thumb.classList.contains("is-selected");
            grid.querySelectorAll(".is-selected").forEach((t) => t.classList.remove("is-selected"));
            selectedImageSrc = was ? null : img.src;
            if (!was) thumb.classList.add("is-selected");
          });
          grid.appendChild(thumb);
        }
      }
      function status(msg) {
        $("status").textContent = msg;
      }
      async function ready() {
        if (!vaultHandle) vaultHandle = await getVault();
        if (await ensurePermission(vaultHandle)) return true;
        status("Vault access was declined. Re-pick the folder in settings.");
        return false;
      }
      function noteContext() {
        const tags = $("tags-input").value.split(",").map((t) => t.trim()).filter(Boolean);
        const title = $("title-input").value.trim() || pageData.title || "Untitled";
        return { title, tags, url: pageData.url };
      }
      async function saveImageAttachment(settings) {
        if (!selectedImageSrc) return null;
        const res = await fetch(selectedImageSrc);
        if (!res.ok) throw new Error("image fetch failed");
        const blob = await res.blob();
        const extFromType = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp", "image/avif": ".avif", "image/svg+xml": ".svg" }[blob.type];
        const urlExt = selectedImageSrc.split("?")[0].match(/\.(jpe?g|png|gif|webp|avif|svg)$/i)?.[0];
        const ext = extFromType ?? urlExt ?? ".jpg";
        const base = sanitizeFilename(noteContext().title);
        const relPath = [settings.attachmentsFolder, `${base}${ext}`].filter(Boolean).join("/");
        const written = await writeFile(vaultHandle, relPath, blob);
        return written.split("/").pop();
      }
      async function saveNote({ body }) {
        if (!await ready()) return;
        const settings = await getSettings();
        const ctx = noteContext();
        status("Saving\u2026");
        try {
          let markdown = expand(settings.frontmatterTemplate, ctx);
          const imageName = await saveImageAttachment(settings);
          if (imageName) markdown += `![[${imageName}]]

`;
          markdown += body;
          const filename = sanitizeFilename(expand(settings.filenameTemplate, ctx)) + settings.fileExtension;
          const relPath = [settings.notesFolder, filename].filter(Boolean).join("/");
          const written = await writeFile(vaultHandle, relPath, markdown);
          if (settings.openInObsidian) {
            const file = written.replace(/\.mdx?$/, "");
            const url = `obsidian://open?vault=${encodeURIComponent(vaultHandle.name)}&file=${encodeURIComponent(file)}`;
            const tab = await chrome.tabs.create({ url, active: false });
            setTimeout(() => chrome.tabs.remove(tab.id).catch(() => {
            }), 3e3);
          }
          status(`Saved ${written}`);
          setTimeout(() => window.close(), 900);
        } catch (err) {
          status(`Could not save: ${err.message}`);
        }
      }
      $("save-btn").addEventListener("click", () => {
        const ctx = noteContext();
        let body = `[${ctx.title}](${pageData.url})

`;
        const text = $("text-input").value.trim();
        if (text) body += text.split("\n").map((l) => `> ${l}`).join("\n") + "\n";
        saveNote({ body });
      });
      $("article-btn").addEventListener("click", async () => {
        status("Capturing article\u2026");
        let articleMd = "";
        try {
          const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: activeTabId },
            files: ["dist/extract.js"]
          });
          articleMd = result?.articleMd || "";
        } catch {
        }
        const body = articleMd ? `${articleMd}

[Source](${pageData.url})
` : `[${noteContext().title}](${pageData.url})
`;
        saveNote({ body });
      });
      init();
    }
  });
  require_popup();
})();
