import { os } from "../framework.js";

export async function isAppOnDesktop(appId) {
  try {
    const desktopFolder = await os.fs.readdir(["Desktop"]);
    for (const [name, itemData] of Object.entries(desktopFolder)) {
      if (name.endsWith(".desktop") && itemData.type === "file") {
        try {
          const parsed = JSON.parse(await os.fs.read(["Desktop", name]));
          if (parsed && parsed.app === appId) return true;
        } catch (e) {}
      }
    }
  } catch (e) {}
  return false;
}

export async function addAppToDesktop(appId, appData) {
  const title = (appData && (appData.title || appData.displayName)) || appId;
  const fileContent = JSON.stringify({
    app: appId,
    name: title,
    path: appData?.icon || "",
  });
  await os.fs.mkdir(["Desktop"]);
  const fileName = await os.fs.createFile(
    ["Desktop"],
    `${title}.desktop`,
    fileContent,
    "text",
  );
  try {
    await os.desktopUI?.iconManager?.createDesktopFileIcon(fileName);
  } catch (e) {}
  return fileName;
}

export function launchAppFromDesktop(appId) {
  os.app.launch(appId);
}

// Every app that has an icon on the desktop, as a Set of app ids, from one read
// of the Desktop folder (so a list of 100+ apps doesn't read it 100+ times).
export async function appsOnDesktop() {
  const ids = new Set();
  try {
    const desktopFolder = await os.fs.readdir(["Desktop"]);
    for (const [name, itemData] of Object.entries(desktopFolder)) {
      if (!name.endsWith(".desktop") || itemData.type !== "file") continue;
      try {
        const parsed = JSON.parse(await os.fs.read(["Desktop", name]));
        if (parsed && parsed.app) ids.add(parsed.app);
      } catch (e) {}
    }
  } catch (e) {}
  return ids;
}

// Takes an app's icon off the desktop. The app itself stays installed.
export async function removeAppFromDesktop(appId) {
  let removed = 0;
  try {
    const desktopFolder = await os.fs.readdir(["Desktop"]);
    for (const [name, itemData] of Object.entries(desktopFolder)) {
      if (!name.endsWith(".desktop") || itemData.type !== "file") continue;
      try {
        const parsed = JSON.parse(await os.fs.read(["Desktop", name]));
        if (!parsed || parsed.app !== appId) continue;
        await os.fs.delete(["Desktop"], name);
        document
          .querySelector(`.desktop-file-icon[data-file-name="${CSS.escape(name)}"]`)
          ?.remove();
        removed += 1;
      } catch (e) {}
    }
  } catch (e) {}
  return removed;
}
