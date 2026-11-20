# Slim Bones for Blockbench

A Blockbench 5.2+ plugin that draws armature bones **thin and see-through**, so they stop hiding the joints you're
trying to place while rigging. The **selected bone** stays solid and a bit wider, so it's easy to find.

It's **display only**. Bone width, length, position, the saved project, export, vertex weights and Calculate Vertex
Weights are all unaffected.

## Install
**File ▸ Plugins ▸ Load Plugin from File**, then pick [`slim_bones.js`](slim_bones.js) (optionally keep `about.md`
next to it).

## Use
- **View ▸ Slim Bones** switches between slim and Blockbench's normal bones. For a shortcut, search for "Slim
  Bones" in **Settings ▸ Keybindings**.
- **Settings ▸ Preview**:
  - **Slim bones: thickness**: drawn width as a fraction of normal (default **0.3**);
  - **Slim bones: opacity**: opacity of unselected bones (default **0.4**).

It applies to every bone: existing ones, new ones, and after switching or reopening projects. While the Weight Brush
is active, Blockbench's own extra transparency still applies.

## How it works
In `armature_bone.ts`, each bone's 3D object holds one preview diamond, scaled to `width / 2` in the bone preview
controller's `updateTransform`, which then fires an `update_transform` event. Unselected bones share one material.
The plugin:
- narrows the diamond after that event;
- wraps the controller's `updateFaces` and `updateSelection` to lower the opacity afterwards.

Auto weights read the bones themselves and their length, never the preview diamond. Disabling the plugin unwraps the
controller and restores the normal look.

## Tested
In Blockbench 5.2.2 on a real rig: bones become thin and see-through so the joints and wireframe stay visible, and
the selected bone stands out.

Offline: `node tests/verify_slim_bones.js` runs against a mock that behaves like Blockbench's bone preview
controller. It checks:
- thin, see-through bones, and the selected bone standing out;
- new bones and selection changes;
- the Weight Brush transparency, the settings, and the toggle restoring the exact normal look;
- bone data never changing, and a clean unload.

## Credits
Written with the help of an AI coding assistant (Claude). Issues and pull requests are welcome.

## License
[MIT](LICENSE)
