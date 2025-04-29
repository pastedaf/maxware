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

        // Keep original Z positions for reset/reference if needed
        geometry.userData = { originalZ: new Float32Array(geometry.attributes.position.array.filter((_, i) => (i + 1) % 3 === 0)) };


        const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            wireframe: false,
            flatShading: true,
            emissive: 0x112211, // Slightly darker emissive
            specular: 0x336633, // Slightly darker specular
            shininess: 40,
            side: THREE.DoubleSide // Render backface for wireframe
        });

        // Could add other materials here if needed later
        // const basicMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: false, side: THREE.DoubleSide });

        return {
            geometry,
            material, // Default material
            defaultSettings: {
                audioInfluence: 1.0,
                decayRate: 0.98,
                heightScale: 3,
                colorMapping: 'height', // 'height', 'audio', 'combined', 'frequencyBands'
                wavePattern: 'radial', // 'radial', 'linear', 'random', 'sineWave', 'checkerboard'
                frequencyRange: 'mid', // 'low', 'mid', 'high'
                visible: true,
                wireframe: false,
                motionInfluenceFactor: 0.5, // How much camera motion affects scale/decay (0-1)
                pokeStrength: 0.2, // How much mouse hover affects height per frame
                pokeRadius: 1.5, // Radius of mouse hover effect
                lowColor: new THREE.Color(0x003300),
                midColor: new THREE.Color(0x00ff00),
                highColor: new THREE.Color(0xffffff),
                position: new THREE.Vector3(), // These are set per instance
                rotation: new THREE.Euler()   // These are set per instance
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
        // Clone userData as well
        geometry.userData = { ...this.gridTemplate.geometry.userData };
        geometry.userData.originalZ = new Float32Array(geometry.userData.originalZ); // Ensure deep copy


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
        // Ensure wireframe setting matches material state initially
        material.wireframe = newSettings.wireframe;


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

        // --- Add GUI Controls ---
        controllers.push(
            guiFolder.add(settings, 'visible').name("Visible").onChange(val => grid.visible = val),
            guiFolder.add(settings, 'wireframe').name("Wireframe").onChange(val => material.wireframe = val),
            guiFolder.add(settings, 'audioInfluence', 0, 2).name("Audio Influence").step(0.1),
            guiFolder.add(settings, 'heightScale', 0.1, 10).name("Height Scale").step(0.1), // Increased range
            guiFolder.add(settings, 'decayRate', 0.9, 0.999).name("Poke Decay").step(0.001),
            guiFolder.add(settings, 'pokeStrength', 0.05, 1.0).name("Poke Strength").step(0.05),
            guiFolder.add(settings, 'pokeRadius', 0.5, 5.0).name("Poke Radius").step(0.1),
            guiFolder.add(settings, 'colorMapping', ['height', 'audio', 'combined', 'frequencyBands']).name("Color Mapping"),
            guiFolder.add(settings, 'wavePattern', ['radial', 'linear', 'random', 'sineWave', 'checkerboard']).name("Wave Pattern"),
            guiFolder.add(settings, 'frequencyRange', ['low', 'mid', 'high']).name("Audio Freq Range"),
            guiFolder.add(settings, 'motionInfluenceFactor', 0, 1).name("Motion Influence").step(0.05),
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

        // Add Reset Button
        settings.resetFunc = () => { this.resetToDefaults(); }; // Assign function to settings object
        controllers.push(guiFolder.add(settings, 'resetFunc').name("Reset Settings"));


        grid.userData.controllers = controllers; // Store controllers

        guiFolder.open(); // Keep the new instance GUI open

        this.scene.add(grid);
        this.instances.push(grid);
        this.selectInstance(grid); // Select the newly added instance
        return grid;
    }

    resetToDefaults() {
        if (!this.currentInstance) return;

        const instance = this.currentInstance;
        const defaults = this.gridTemplate.defaultSettings;
        const settings = instance.userData.settings;

        // Reset settings to defaults (handle colors separately)
        for (const key in defaults) {
            if (key !== 'lowColor' && key !== 'midColor' && key !== 'highColor' && key !== 'position' && key !== 'rotation' && typeof defaults[key] !== 'function') {
                 if (settings.hasOwnProperty(key)) {
                    settings[key] = defaults[key];
                 }
            }
        }
        // Reset colors
        settings.lowColor.copy(defaults.lowColor);
        settings.midColor.copy(defaults.midColor);
        settings.highColor.copy(defaults.highColor);

        // Reset material property
        instance.material.wireframe = settings.wireframe;

        // Reset target heights
        instance.userData.targetHeights.fill(0);

        // Update GUI controllers
        instance.userData.controllers.forEach(controller => {
            // Check if the controller is for the reset function itself
            if (controller.property !== 'resetFunc') {
                 controller.updateDisplay();
            }
        });

        console.log(`Instance ${instance.uuid} settings reset to defaults.`);
    }


    deleteCurrent() {
        if (!this.currentInstance) return;

        const instanceToDelete = this.currentInstance;
        const index = this.instances.indexOf(instanceToDelete);

        if (index > -1) {
            // Detach transform controls first
            if (this.transformControls && this.transformControls.object === instanceToDelete) {
                this.transformControls.detach();
            }

            // Remove GUI folder and its controllers
            const guiFolder = instanceToDelete.userData.guiFolder;
            if (guiFolder) {
                guiFolder.close(); // Close it first
                // Remove controllers individually
                instanceToDelete.userData.controllers.forEach(controller => {
                    try {
                        guiFolder.remove(controller);
                    } catch (e) {
                        console.warn("Could not remove controller:", controller.property, e);
                    }
                });
                // Remove the folder itself
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

            // Remove from scene and dispose
            this.scene.remove(instanceToDelete);
            if (instanceToDelete.geometry) instanceToDelete.geometry.dispose();
            if (instanceToDelete.material) instanceToDelete.material.dispose();

            // Remove from instance array
            this.instances.splice(index, 1);

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
            // Close previously selected instance's GUI folder
            if (this.currentInstance && this.currentInstance.userData.guiFolder) {
                 this.currentInstance.userData.guiFolder.close();
            }

            this.currentInstance = instance;
            if (this.transformControls) {
                this.transformControls.attach(instance);
            }
            // Open the newly selected instance's GUI folder
            if (this.currentInstance.userData.guiFolder) {
                this.currentInstance.userData.guiFolder.open();
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
                // No need to update GUI here, it reflects the object's state
            }
        });

        // Add the transform controls gizmo to the scene
        this.scene.add(this.transformControls);

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
        if (this.transformControls) {
            this.transformControls.dispose();
            this.scene.remove(this.transformControls);
        }
        // Use deleteCurrent repeatedly to ensure proper cleanup
        while (this.instances.length > 0) {
             this.selectInstance(this.instances[0]); // Select first to delete
             this.deleteCurrent();
        }
        this.instances = [];
        this.currentInstance = null;

        // Consider removing the main GUI object if GridManager owned it
        // this.gui.destroy();
    }
}
