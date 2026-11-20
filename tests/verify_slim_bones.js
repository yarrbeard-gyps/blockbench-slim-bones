// Offline checks for slim_bones.js. Run: node tests/verify_slim_bones.js
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const FILE = path.resolve(__dirname, '..', 'slim_bones.js');
let pass = 0;
const ok = (cond, msg) => { assert(cond, msg); pass++; console.log('ok  ' + msg); };
const near = (a, b) => Math.abs(a - b) < 1e-9;

// ---- core
const core = require(FILE);
ok(near(core.drawnScale(2, true, 0.3, false), 0.3) && near(core.drawnScale(2, false, 0.3, false), 1), 'drawn width = width/2 x thickness, normal when off');
ok(core.drawnScale(2, true, 0.3, true) > core.drawnScale(2, true, 0.3, false), 'selected bone drawn wider');
ok(core.drawnOpacity(0.3, true, 0.4) === 0.3 && core.drawnOpacity(1, true, 0.4) === 0.4, 'never more opaque than Blockbench (weight brush 0.3 kept)');

// ---- mock of Blockbench's ArmatureBone preview controller (same behaviour as armature_bone.ts)
let weightBrush = false;
const listeners = {};
const ctrl = {
	material: { opacity: 1 }, material_selected: { opacity: 1 },
	on(e, f) { (listeners[e] = listeners[e] || []).push(f); }, removeListener(e, f) { listeners[e] = listeners[e].filter(x => x !== f); },
	dispatchEvent(e, d) { (listeners[e] || []).forEach(f => f(d)); },
	setup(el) {
		const outline = { material: { opacity: 1, color: 0x111111 } };
		el.scene_object = { children: [{ scale: { x: 1, y: 1, z: 1 }, material: null, children: [outline] }] };
		this.updateTransform(el); this.updateFaces(el); this.updateSelection(el);
	},
	updateTransform(el) {
		const m = el.scene_object.children[0];
		m.scale.y = el.length; m.scale.x = el.width / 2; m.scale.z = el.width / 2;
		this.dispatchEvent('update_transform', { element: el });
	},
	updateFaces(el) { this.material.opacity = weightBrush ? 0.3 : 1; },
	updateSelection(el) { const m = el.scene_object.children[0]; m.material = el.selected ? this.material_selected : this.material; },
};
const mkBone = (name, width, length, selected = false) => ({ name, width, length, selected, origin: [0, 4, 0] });
const ArmatureBone = { preview_controller: ctrl, all: [] };
const hip = mkBone('hip', 4, 8), thigh = mkBone('thigh_l', 4, 6, true);
[hip, thigh].forEach(b => { ctrl.setup(b); ArmatureBone.all.push(b); });
const savedData = JSON.stringify([hip, thigh].map(b => ({ width: b.width, length: b.length, origin: b.origin })));

const settingsMap = {};
let registered, toggle, viewMenu = [];
const ctx = {
	Plugin: { register: (id, o) => { registered = { id, o }; } }, BARS: {}, ArmatureBone,
	Setting: class { constructor(id, o) { Object.assign(this, o); this.id = id; settingsMap[id] = this; } delete() { this.deleted = true; } },
	Toggle: class { constructor(id, o) { toggle = this; Object.assign(this, o); this.id = id; } delete() { this.deleted = true; } },
	MenuBar: { addAction: (a, p) => viewMenu.push([a, p]) },
	Canvas: { updateView() {} },
};
const orig = { faces: ctrl.updateFaces, sel: ctrl.updateSelection };
new Function(...Object.keys(ctx), fs.readFileSync(FILE, 'utf8'))(...Object.values(ctx));
registered.o.onload();
const sx = b => b.scene_object.children[0].scale.x;
const outlineOp = b => b.scene_object.children[0].children[0].material.opacity;

ok(viewMenu[0][1] === 'view' && toggle.linked_setting === 'slim_bones_enabled', 'toggle in the View menu, linked to the setting');
ok(near(sx(hip), 2 * 0.3) && near(ctrl.material.opacity, 0.4) && near(outlineOp(hip), 0.4), 'existing bones: thin (0.3) and see-through (0.4)');
ok(sx(thigh) > sx(hip) / 2 * 2 * 1.0 && near(sx(thigh), 2 * 0.3 * 1.6) && outlineOp(thigh) === 1, 'selected bone wider with a solid outline');
ok(hip.scene_object.children[0].scale.y === 8, 'bone length drawn as before');

// New bone after load (or after a project switch) gets the slim look via setup().
const shin = mkBone('shin_l', 4, 5); ctrl.setup(shin); ArmatureBone.all.push(shin);
ok(near(sx(shin), 0.6), 'new bones are slim too');

// Selection change.
thigh.selected = false; hip.selected = true; ctrl.updateSelection(thigh); ctrl.updateSelection(hip);
ok(near(sx(thigh), 0.6) && near(sx(hip), 0.96) && outlineOp(thigh) === 0.4, 'selection change updates who stands out');

// Weight brush: Blockbench's 0.3 kept (more transparent than ours).
weightBrush = true; ctrl.updateFaces(hip);
ok(near(ctrl.material.opacity, 0.3), 'weight brush transparency respected');
weightBrush = false;

// Settings change.
settingsMap.slim_bones_thickness.value = 0.5; settingsMap.slim_bones_opacity.value = 0.7; settingsMap.slim_bones_thickness.onChange();
ok(near(sx(shin), 1.0) && near(ctrl.material.opacity, 0.7), 'thickness / opacity settings apply to every bone');

// Toggle off → exactly Blockbench's own look.
settingsMap.slim_bones_enabled.value = false; settingsMap.slim_bones_enabled.onChange();
ok([hip, thigh, shin].every(b => near(sx(b), b.width / 2)) && ctrl.material.opacity === 1 && outlineOp(shin) === 1, 'toggle off: normal width and opacity');
settingsMap.slim_bones_enabled.value = true; settingsMap.slim_bones_enabled.onChange();
ok(near(sx(shin), 1.0), 'toggle on again');

ok(JSON.stringify([hip, thigh].map(b => ({ width: b.width, length: b.length, origin: b.origin }))) === savedData, 'bone data (width, length, origin) never changed');

registered.o.onunload();
ok(ctrl.updateFaces === orig.faces && ctrl.updateSelection === orig.sel && !listeners.update_transform.length, 'unload restores the controller');
ok([hip, thigh, shin].every(b => near(sx(b), b.width / 2)) && ctrl.material.opacity === 1, 'unload restores the normal look');
ok(toggle.deleted && settingsMap.slim_bones_opacity.deleted, 'unload removes toggle and settings');
console.log(`\n${pass} checks passed`);
