// The window's copy lives in Main.html (already worded for Safari Settings); this file
// only mirrors the extension's on/off state onto the body and wires the one button.
function show(enabled, useSettingsInsteadOfPreferences) {
    if (typeof enabled === "boolean") {
        document.body.classList.toggle("state-on", enabled);
        document.body.classList.toggle("state-off", !enabled);
    } else {
        document.body.classList.remove("state-on");
        document.body.classList.remove("state-off");
    }
}

function openPreferences() {
    webkit.messageHandlers.controller.postMessage("open-preferences");
}

document.querySelector("button.open-preferences").addEventListener("click", openPreferences);
