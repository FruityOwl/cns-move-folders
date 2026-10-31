# Move & Folders for Cast & Scene

An unofficial add-on for the [Cast & Scene](https://github.com/DungeonMaxter/cast-and-scene) module for Foundry VTT. It adds three things the GM asked for:

- **Move mode:** drag characters around the stage directly instead of opening each character's editor.
- **Character Pool folders:** organise a long Character Pool into folders and subfolders.
- **Scene preset order:** drag presets into the order you want, or sort them by name or creation date.

It works on top of your existing Cast & Scene world. Scene presets, positions, names and the Character Pool are used as they are; nothing has to be recreated. This add-on contains no Cast & Scene code. You need Cast & Scene installed and active.

## Install

In Foundry: **Add-on Modules → Install Module**, paste this manifest URL and click **Install**:

```
https://github.com/FruityOwl/cns-move-folders/releases/latest/download/module.json
```

Then enable **Move & Folders for Cast & Scene** (and Cast & Scene) in your world's **Manage Modules**. Only the GM needs anything; players just see the result.

## Move mode

- Click **Move characters** in the Cast & Scene Director (Stage section) or in Quick Access.
- While it is on, a dashed outline and a hint show on the stage, and every character currently on stage can be dragged.
- Each drop saves the new X/Y into that character's scene preset and updates the live stage, so players and OBS/Streamer clients follow the move. Scale, layer order, Spotlight and Camera Focus framing are unchanged. Dragging also works while Camera Focus is zoomed in.
- Click **Done moving** or press **Esc** to finish. Move mode is local to the GM who turned it on.
- Optional: assign a key to *Move characters on stage: on / off* in **Configure Controls**, or use a Script macro:

```js
game.modules.get("cns-move-folders").api.toggleMoveMode();
```

## Character Pool folders

- In the Director's **Character pool**, click the folder button next to the search box to create a folder.
- Drag characters onto a folder (or into an open folder) to file them; drag a folder onto another folder to nest it. Drop on an unfiled character or empty space to move it back to the top level.
- Folder headers show a character count and quick buttons: new character in this folder, create subfolder, rename, delete. Right-click a folder or a character for the same actions plus **Move to folder…**.
- The character editor has a **Folder** field for pool characters.
- Search keeps folders that contain matching characters and opens them.
- **Add character** in Scene Presets uses the same folders; tick a folder's checkbox to select everything in it.
- Deleting a folder never deletes characters: its characters and subfolders move up one level.
- Open/closed folders are remembered per browser.

Folders and folder membership are stored in this add-on's own world settings. Cast & Scene's data is not changed, so you can disable or remove this add-on at any time; characters simply show as an unsorted list again.

## Scene preset order

- In the Director's **Scene presets** list, drag a preset up or down. A gold line shows where it will land. The order is saved in Cast & Scene's own preset list, so Quick Access follows it too (presets bound to the current scene still come first there) and it stays if you remove this add-on.
- The dropdown above the list sorts by **Name A–Z**, **Name Z–A**, **Newest first** or **Oldest first**, in the Director and Quick Access. Names sort naturally, so 2.1 comes before 10 and 6.1 follows 6.
- Sorting only changes how the list is shown and is remembered per browser; your manual order is kept. Pick **Manual** to get it back. Dragging while a sort is on switches to Manual and keeps the order you see.
- Cast & Scene stores no creation dates. It does only ever add presets to the end of its list, so the first time this add-on runs it records that order as oldest to newest, then adds new presets as they appear. Presets made while the add-on is disabled are counted from when it next runs.

## Compatibility

- Foundry VTT 14, Cast & Scene 1.0.0 or newer (tested with 1.0.0 and 1.2.0).
- The add-on attaches to Cast & Scene's Director and Quick Access windows. A future Cast & Scene update that changes those windows could require an update here.

## Releasing a new version

Bump `version` in `module.json` and push to `main`. The GitHub Action builds `module.zip` and publishes a release; Foundry then offers the update.

## License

MIT. See [LICENSE](LICENSE). Cast & Scene itself is © Dungeon Maxter and is not included or redistributed here.
