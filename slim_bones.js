/*
 * Slim Bones for Blockbench 5.2+
 *
 * Display-only: draws armature bones thinner and see-through so they don't hide the joints you're placing.
 * Nothing about the bones themselves changes: not width, length, position, saved data, export or weights.
 *
 * How bones are drawn (src/js/outliner/types/armature_bone.ts): each bone's 3D object holds one preview
 * mesh (scene_object.children[0]), a diamond whose X/Z scale is set to width/2 in
 * preview_controller.updateTransform, which then fires an 'update_transform' event. All unselected bones
 * share preview_controller.material; selected ones use material_selected. updateFaces resets
 * material.opacity (1, or 0.3 while the weight brush is active).
 *
 * This plugin listens to 'update_transform' to narrow the diamond after Blockbench sizes it, and wraps
 * updateFaces / updateSelection to lower the opacity afterwards. Calculate Vertex Weights reads the bone
 * objects and their length, never the preview diamond, so weights are unaffected.
 *
 * The functions above "Blockbench layer" have no Blockbench dependencies, for Node tests.
 */
(function () {
	'use strict';

	const PLUGIN_ID = 'slim_bones';
	const SELECTED_THICKNESS_BOOST = 1.6; // the selected bone is drawn a bit wider than the rest

	/** Drawn X/Z scale for a bone: Blockbench uses width / 2. */
	function drawnScale(width, enabled, thickness, selected) {
		const base = width / 2;
		if (!enabled) return base;
		const f = selected ? Math.min(1, thickness * SELECTED_THICKNESS_BOOST) : thickness;
		return base * f;
	}

	/** Opacity for the shared unselected-bone material, never above Blockbench's own value. */
	function drawnOpacity(blockbenchOpacity, enabled, opacity) {
		return enabled ? Math.min(blockbenchOpacity, opacity) : blockbenchOpacity;
	}

	const core = { drawnScale, drawnOpacity, SELECTED_THICKNESS_BOOST };

	// Outside Blockbench (Node tests) export the core and stop here.
	if (typeof Plugin === 'undefined' || typeof BARS === 'undefined') {
		if (typeof module === 'object' && module && module.exports) module.exports = core;
		return;
	}

	// ================================================================ Blockbench layer

	let ctrl = null, origUpdateFaces = null, origUpdateSelection = null, wrappedFaces = null, wrappedSelection = null;
	let settingEnabled = null, settingThickness = null, settingOpacity = null, toggle = null;
	let active = false;

	const enabled = () => active && !!(settingEnabled && settingEnabled.value);
	const thickness = () => Math.max(0.02, Math.min(1, Number(settingThickness && settingThickness.value) || 0.3));
	const opacity = () => Math.max(0.02, Math.min(1, Number(settingOpacity && settingOpacity.value) || 0.4));

	function previewMesh(bone) {
		return bone && bone.scene_object && bone.scene_object.children && bone.scene_object.children[0];
	}

	function applyScale(bone) {
		const mesh = previewMesh(bone);
		if (!mesh || typeof bone.width !== 'number') return;
		mesh.scale.x = mesh.scale.z = drawnScale(bone.width, enabled(), thickness(), !!bone.selected);
	}

	function applyOutline(bone) {
		const mesh = previewMesh(bone);
		const outline = mesh && mesh.children && mesh.children[0];
		if (!outline || !outline.material) return;
		outline.material.opacity = enabled() && !bone.selected ? opacity() : 1;
	}

	function applySharedMaterial() {
		if (!ctrl || !ctrl.material) return;
		// updateFaces has just set Blockbench's value (1, or 0.3 with the weight brush).
		ctrl.material.opacity = drawnOpacity(ctrl.material.opacity, enabled(), opacity());
		ctrl.material.needsUpdate = true;
	}

	function onUpdateTransform({ element }) {
		applyScale(element);
	}

	/** Re-apply to every bone (after toggling or changing a setting). */
	function refreshAll() {
		if (!ctrl || typeof ArmatureBone === 'undefined') return;
		for (const bone of ArmatureBone.all) {
			if (!previewMesh(bone)) continue;
			try {
				ctrl.updateFaces(bone);     // resets Blockbench's opacity, then ours is applied
				ctrl.updateSelection(bone);
			} catch (err) { console.warn('[Slim Bones]', err); }
			// Directly too, so this also restores Blockbench's look after unwrapping on unload.
			applyScale(bone);
			applyOutline(bone);
		}
		if (typeof Canvas !== 'undefined' && Canvas.updateView) Canvas.updateView({});
	}

	Plugin.register(PLUGIN_ID, {
		title: 'Slim Bones',
		author: 'yarrbeard-gyps',
		description: 'Draw armature bones thin and see-through (display only), with the selected bone standing out.',
		icon: 'line_weight',
		version: '1.0.0',
		variant: 'both',
		min_version: '5.2.0',
		tags: ['Rigging', 'Interface'],
		onload() {
			if (typeof ArmatureBone === 'undefined' || !ArmatureBone.preview_controller) {
				console.warn('[Slim Bones] ArmatureBone not found; this needs Blockbench 5.2+');
				return;
			}
			ctrl = ArmatureBone.preview_controller;

			settingEnabled = new Setting('slim_bones_enabled', {
				name: 'Slim bones', description: 'Draw armature bones thin and see-through (Slim Bones plugin, display only)',
				category: 'preview', value: true, onChange: refreshAll,
			});
			settingThickness = new Setting('slim_bones_thickness', {
				name: 'Slim bones: thickness', description: 'Drawn bone width as a fraction of normal (0.05 to 1). Bone data is not changed.',
				category: 'preview', type: 'number', value: 0.3, min: 0.05, max: 1, step: 0.05, onChange: refreshAll,
			});
			settingOpacity = new Setting('slim_bones_opacity', {
				name: 'Slim bones: opacity', description: 'Opacity of unselected bones (0.05 to 1). The selected bone stays solid.',
				category: 'preview', type: 'number', value: 0.4, min: 0.05, max: 1, step: 0.05, onChange: refreshAll,
			});

			origUpdateFaces = ctrl.updateFaces;
			origUpdateSelection = ctrl.updateSelection;
			wrappedFaces = function (element) {
				const r = origUpdateFaces.apply(this, arguments);
				applySharedMaterial();
				return r;
			};
			wrappedSelection = function (element) {
				const r = origUpdateSelection.apply(this, arguments);
				applyScale(element);
				applyOutline(element);
				return r;
			};
			ctrl.updateFaces = wrappedFaces;
			ctrl.updateSelection = wrappedSelection;
			ctrl.on('update_transform', onUpdateTransform);
			active = true;

			toggle = new Toggle('toggle_slim_bones', {
				name: 'Slim Bones',
				description: 'Switch between slim, see-through bones and Blockbench\'s normal bones',
				icon: 'line_weight',
				category: 'view',
				linked_setting: 'slim_bones_enabled',
			});
			MenuBar.addAction(toggle, 'view');
			refreshAll();
		},
		onunload() {
			active = false;
			if (ctrl) {
				ctrl.removeListener('update_transform', onUpdateTransform);
				// Restore only if nobody wrapped after us; otherwise our wrappers pass through (active = false).
				if (ctrl.updateFaces === wrappedFaces) ctrl.updateFaces = origUpdateFaces;
				if (ctrl.updateSelection === wrappedSelection) ctrl.updateSelection = origUpdateSelection;
				refreshAll(); // back to Blockbench's width and opacity
			}
			if (toggle) toggle.delete();
			for (const s of [settingEnabled, settingThickness, settingOpacity]) if (s) s.delete();
			toggle = settingEnabled = settingThickness = settingOpacity = null;
			ctrl = null;
		},
	});
})();
