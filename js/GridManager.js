import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import * as dat from 'https://cdn.skypack.dev/dat.gui';

export class GridManager {
    constructor(scene, gui, size = 15, segments = 63) {
        this.scene = scene;
        this.gui = gui;
        this.gridSize = size; // Physical size of the grid plane
        this.gridSegments = segments; // Number of segments (vertices = segments + 1)
        this.verticesCount = (this.gridSegments + 1) * (this.gridSegments + 1);
        this.instances = [];
        this.currentInstance = null;
        this.transformControls = null;
        this.orbitControls = null; // Reference to OrbitControls needed for enabling/disabling
        this.gridTemplate = this.createTemplate();
        this.instanceCount = 0;
    }

    createTemplate() {
        const geometry = new THREE.PlaneGeometry(this.gridSize, this.gridSize, this.gridSegments, this.gridSegments);

        // Ensure colors attribute exists
        const colors = new Float32Array(this.verticesCount * 3);
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            wireframe: false,
            flatShading: true,
            emissive: 0x224422,
            specular: 0x448844,
            shininess: 50,
        });

        return {
            geometry,
            material,
            defaultSettings: {
                audioInfluence: 1.0,
                decayRate: 0.98,
                heightScale: 3,
                colorMapping: 'height', // 'height', 'audio', 'combined'
                wavePattern: 'radial', // 'radial', 'linear', 'random'
                frequencyRange: 'mid', // 'low', 'mid', 'high'
                visible: true,
                lowColor: new THREE.Color(0x003300),
                midColor: new THREE.Color(0x00ff00),
                highColor: new THREE.Color(0xffffff),
                position: new THREE.Vector3(),
                rotation: new THREE.Euler()
            }
        };
    }

    addInstance(baseInstance = null) {
        const geometry = this.gridTemplate.geometry.clone();

        // Ensure attributes are cloned properly for independent modification
        geometry.attributes.position = geometry.attributes.position.clone();
        geometry.attributes.position.array = new Float32Array(geometry.attributes.position.array);
        geometry.attributes.color = geometry.attributes.color.clone();
        geometry.attributes.color.array = new Float32Array(geometry.attributes.color.array);

        const material = this.gridTemplate.material.clone();

        const grid = new THREE.Mesh(geometry, material);
        grid.rotation.x = -Math.PI / 2; // Default orientation

        const sourceSettings = baseInstance ? baseInstance.userData.settings : this.gridTemplate.defaultSettings;

        // Deep clone settings to avoid reference issues, especially for colors/vectors
        const newSettings = {
            ...sourceSettings,
            lowColor: sourceSettings.lowColor.clone(),
            midColor: sourceSettings.midColor.clone(),
            highColor: sourceSettings.highColor.clone(),
            position: new THREE.Vector3(), // Position/rotation are unique per instance
            rotation: new THREE.Euler()
        };

        grid.userData = {
            targetHeights: new Float32Array(this.verticesCount),
            settings: newSettings,
            guiFolder: null,
            controllers: [] // To keep track of GUI controllers for removal
        };

        if (baseInstance) {
            grid.position.copy(baseInstance.position);
            grid.rotation.copy(baseInstance.rotation);
        }
        // Initialize settings position/rotation from the grid's current state
        grid.userData.settings.position.copy(grid.position);
        grid.userData.settings.rotation.copy(grid.rotation);

        this.instanceCount++;
        const folderName = `Grid ${this.instanceCount}`;
        const guiFolder = this.gui.addFolder(folderName);
        grid.userData.guiFolder = guiFolder;

        const settings = grid.userData.settings;
        const controllers = []; // Local array to store controllers before adding to userData

        controllers.push(
            guiFolder.add(settings, 'audioInfluence', 0, 2).name("Audio Influence").step(0.1),
            guiFolder.add(settings, 'heightScale', 0.5, 5).name("Height Scale").step(0.1),
            guiFolder.add(settings, 'colorMapping', ['height', 'audio', 'combined']).name("Color Mapping"),
            guiFolder.add(settings, 'wavePattern', ['radial', 'linear', 'random']).name("Wave Pattern"),
            guiFolder.add(settings, 'frequencyRange', ['low', 'mid', 'high']).name("Frequency Range"),
            guiFolder.add(settings, 'visible').name("Visible").onChange(val => grid.visible = val),
            guiFolder.add(settings, 'decayRate', 0.9, 0.999).name("Decay Rate").step(0.001),
            // Use an intermediate object for color GUI to handle hex conversion
            guiFolder.addColor(
                { get lowColor() { return settings.lowColor.getHex() }, set lowColor(v) { settings.lowColor.setHex(v) } }, 'lowColor'
            ).name('Low Color'),
            guiFolder.addColor(
                { get midColor() { return settings.midColor.getHex() }, set midColor(v) { settings.midColor.setHex(v) } }, 'midColor'
            ).name('Mid Color'),
            guiFolder.addColor(
                { get highColor() { return settings.highColor.getHex() }, set highColor(v) { settings.highColor.setHex(v) } }, 'highColor'
            ).name('High Color')
        );

        grid.userData.controllers = controllers; // Store controllers

        guiFolder.open();

        this.scene.add(grid);
        this.instances.push(grid);
        this.selectInstance(grid); // Select the newly added instance
        return grid;
    }

    deleteCurrent() {
        if (!this.currentInstance) return;

        const instanceToDelete = this.currentInstance;
        const index = this.instances.indexOf(instanceToDelete);

        if (index > -1) {
            // Remove from scene
            this.scene.remove(instanceToDelete);
            if (instanceToDelete.geometry) instanceToDelete.geometry.dispose();
            if (instanceToDelete.material) instanceToDelete.material.dispose();

            // Remove GUI folder and its controllers
            const guiFolder = instanceToDelete.userData.guiFolder;
            if (guiFolder) {
                // dat.GUI doesn't have a built-in way to remove controllers,
                // but removing the folder itself works.
                try {
                    this.gui.removeFolder(guiFolder);
                } catch (e) {
                    console.warn("Could not remove GUI folder:", e);
                    // Fallback: Hide if removal fails (less clean)
                    if (guiFolder.domElement.parentNode) {
                         guiFolder.domElement.parentNode.removeChild(guiFolder.domElement);
                    }
                }
            }

            // Remove from instance array
            this.instances.splice(index, 1);

            // Detach transform controls if attached to the deleted instance
            if (this.transformControls && this.transformControls.object === instanceToDelete) {
                this.transformControls.detach();
            }

            // Select the previous instance or null if no instances left
            this.currentInstance = this.instances.length > 0 ? this.instances[Math.max(0, index - 1)] : null;
            if (this.currentInstance && this.transformControls) {
                this.transformControls.attach(this.currentInstance);
            }

            console.log(`Instance ${instanceToDelete.uuid} deleted.`);
        }
    }


    selectInstance(instance) {
        if (this.instances.includes(instance)) {
            this.currentInstance = instance;
            if (this.transformControls) {
                this.transformControls.attach(instance);
            }
            console.log(`Selected instance: ${instance.uuid}`);
        } else {
             console.warn("Attempted to select an instance not managed by GridManager.");
        }
    }

    setupTransformControls(camera, renderer, orbitControls) {
        this.orbitControls = orbitControls; // Store reference
        this.transformControls = new TransformControls(camera, renderer.domElement);

        this.transformControls.addEventListener('dragging-changed', event => {
            if (this.orbitControls) {
                this.orbitControls.enabled = !event.value; // Disable orbit controls while dragging
            }
        });

        this.transformControls.addEventListener('objectChange', () => {
            // Update position/rotation in settings when transform controls are used
            if (this.currentInstance) {
                this.currentInstance.userData.settings.position.copy(this.currentInstance.position);
                this.currentInstance.userData.settings.rotation.copy(this.currentInstance.rotation);
            }
        });

        // Add the transform controls gizmo to the scene
        this.scene.add(this.transformControls); // Add the gizmo itself, not the helper

        // Select the first instance if available after setup
        if (this.instances.length > 0) {
            this.selectInstance(this.instances[0]);
        }
    }

    setTransformMode(mode) {
        if (this.transformControls) {
            this.transformControls.setMode(mode);
        }
    }

    dispose() {
        // Clean up resources
        this.instances.forEach(instance => {
            this.scene.remove(instance);
            if (instance.geometry) instance.geometry.dispose();
            if (instance.material) instance.material.dispose();
            // Try removing GUI folder again during full disposal
             if (instance.userData.guiFolder) {
                 try { this.gui.removeFolder(instance.userData.guiFolder); } catch(e) {}
             }
        });
        this.instances = [];
        if (this.transformControls) {
            this.transformControls.dispose();
            this.scene.remove(this.transformControls);
        }
        // Consider removing the main GUI object if GridManager owned it
        // this.gui.destroy();
    }
}
