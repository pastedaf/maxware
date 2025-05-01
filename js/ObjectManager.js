import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import * as dat from 'https://cdn.skypack.dev/dat.gui';

// Default settings structure
const defaultSettings = {
    grid: {
        type: 'grid',
        audioInfluence: 1.0,
        decayRate: 0.98,
        heightScale: 3,
        colorMapping: 'height', // 'height', 'audio', 'combined', 'frequencyBands'
        wavePattern: 'radial', // 'radial', 'linear', 'random', 'sineWave', 'checkerboard'
        frequencyRange: 'mid', // 'low', 'mid', 'high'
        visible: true,
        wireframe: false,
        motionInfluenceFactor: 0.5,
        pokeStrength: 0.2,
        pokeRadius: 1.5,
        lowColor: new THREE.Color(0x003300),
        midColor: new THREE.Color(0x00ff00),
        highColor: new THREE.Color(0xffffff),
        position: new THREE.Vector3(),
        rotation: new THREE.Euler()
    },
    pointcloud: {
        type: 'pointcloud',
        particleCount: 5000,
        particleSize: 0.1,
        distribution: 'sphere', // 'sphere', 'cube', 'plane'
        distributionScale: 10, // Size of the sphere/cube/plane
        audioInfluence: 1.0,
        displacementScale: 2.0, // How much audio displaces points
        colorMapping: 'audio', // 'audio', 'frequencyBands'
        frequencyRange: 'mid', // 'low', 'mid', 'high'
        visible: true,
        motionInfluenceFactor: 0.3, // Less influence maybe?
        lowColor: new THREE.Color(0x0000ff), // Blue
        midColor: new THREE.Color(0x00ffff), // Cyan
        highColor: new THREE.Color(0xffffff), // White
        position: new THREE.Vector3(),
        rotation: new THREE.Euler()
    }
};


export class ObjectManager {
    constructor(scene, gui, gridSize = 15, gridSegments = 63) {
        this.scene = scene;
        this.gui = gui;
        this.gridSize = gridSize; // Physical size of the grid plane
        this.gridSegments = gridSegments; // Number of segments (vertices = segments + 1)
        this.gridVerticesCount = (this.gridSegments + 1) * (this.gridSegments + 1);
        this.instances = [];
        this.currentInstance = null;
        this.transformControls = null;
        this.orbitControls = null; // Reference to OrbitControls needed for enabling/disabling
        this.templates = {
            grid: this.createGridTemplate(),
            pointcloud: this.createPointCloudTemplate()
        };
        this.instanceCount = 0;
    }

    // --- Template Creation ---

    createGridTemplate() {
        const geometry = new THREE.PlaneGeometry(this.gridSize, this.gridSize, this.gridSegments, this.gridSegments);
        const colors = new Float32Array(this.gridVerticesCount * 3);
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.userData = { originalZ: new Float32Array(geometry.attributes.position.array.filter((_, i) => (i + 1) % 3 === 0)) };

        const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            wireframe: false,
            flatShading: true,
            emissive: 0x112211,
            specular: 0x336633,
            shininess: 40,
            side: THREE.DoubleSide
        });

        return {
            geometry,
            material,
            defaultSettings: defaultSettings.grid
        };
    }

    createPointCloudTemplate() {
        const settings = defaultSettings.pointcloud;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(settings.particleCount * 3);
        const colors = new Float32Array(settings.particleCount * 3);
        const initialPositions = new Float32Array(settings.particleCount * 3); // Store initial state

        for (let i = 0; i < settings.particleCount; i++) {
            let x, y, z;
            switch (settings.distribution) {
                case 'cube':
                    x = (Math.random() - 0.5) * settings.distributionScale;
                    y = (Math.random() - 0.5) * settings.distributionScale;
                    z = (Math.random() - 0.5) * settings.distributionScale;
                    break;
                case 'plane': // XZ plane like the grid
                     x = (Math.random() - 0.5) * settings.distributionScale;
                     y = 0;
                     z = (Math.random() - 0.5) * settings.distributionScale;
                     break;
                case 'sphere':
                default:
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.acos((Math.random() * 2) - 1);
                    const radius = Math.random() * settings.distributionScale / 2; // Distribute within the sphere
                    x = radius * Math.sin(phi) * Math.cos(theta);
                    y = radius * Math.sin(phi) * Math.sin(theta);
                    z = radius * Math.cos(phi);
                    break;
            }
            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
            // Store initial positions
            initialPositions[i * 3] = x;
            initialPositions[i * 3 + 1] = y;
            initialPositions[i * 3 + 2] = z;
            // Initial white color
            colors[i * 3] = 1;
            colors[i * 3 + 1] = 1;
            colors[i * 3 + 2] = 1;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.userData = { initialPositions }; // Store for reference

        const material = new THREE.PointsMaterial({
            size: settings.particleSize,
            vertexColors: true,
            sizeAttenuation: true
        });

        return {
            geometry,
            material,
            defaultSettings: settings
        };
    }

    // --- Instance Management ---

    addInstance(type = 'grid', baseInstance = null) {
        if (!this.templates[type]) {
            console.error(`Unknown object type: ${type}`);
            return null;
        }

        const template = this.templates[type];
        const geometry = template.geometry.clone();
        const material = template.material.clone();

        // Ensure attributes are cloned properly for independent modification
        geometry.attributes.position = geometry.attributes.position.clone();
        geometry.attributes.position.array = new Float32Array(geometry.attributes.position.array);
        if (geometry.attributes.color) {
            geometry.attributes.color = geometry.attributes.color.clone();
            geometry.attributes.color.array = new Float32Array(geometry.attributes.color.array);
        }
        // Clone userData as well
        geometry.userData = { ...template.geometry.userData };
        if (geometry.userData.originalZ) { // For grid
             geometry.userData.originalZ = new Float32Array(geometry.userData.originalZ);
        }
        if (geometry.userData.initialPositions) { // For pointcloud
             geometry.userData.initialPositions = new Float32Array(geometry.userData.initialPositions);
        }


        let instanceObject;
        if (type === 'grid') {
            instanceObject = new THREE.Mesh(geometry, material);
            instanceObject.rotation.x = -Math.PI / 2; // Default grid orientation
        } else if (type === 'pointcloud') {
            instanceObject = new THREE.Points(geometry, material);
            // No default rotation for point cloud
        }

        const sourceSettings = baseInstance ? baseInstance.userData.settings : template.defaultSettings;

        // Deep clone settings
        const newSettings = JSON.parse(JSON.stringify(sourceSettings));
        // Restore THREE objects (Color, Vector3, Euler) after stringify/parse
        newSettings.lowColor = new THREE.Color().copy(sourceSettings.lowColor);
        newSettings.midColor = new THREE.Color().copy(sourceSettings.midColor);
        newSettings.highColor = new THREE.Color().copy(sourceSettings.highColor);
        newSettings.position = new THREE.Vector3(); // Always reset position/rotation for new instance
        newSettings.rotation = new THREE.Euler();
        newSettings.type = type; // Ensure type is set

        // Apply specific material properties from settings
        if (type === 'grid') {
            material.wireframe = newSettings.wireframe;
        } else if (type === 'pointcloud') {
            material.size = newSettings.particleSize;
        }

        instanceObject.userData = {
            settings: newSettings,
            guiFolder: null,
            controllers: [] // To keep track of GUI controllers for removal
        };
        // Add type-specific data if needed
        if (type === 'grid') {
             instanceObject.userData.targetHeights = new Float32Array(this.gridVerticesCount);
        }


        if (baseInstance) {
            instanceObject.position.copy(baseInstance.position);
            instanceObject.rotation.copy(baseInstance.rotation);
        }
        // Initialize settings position/rotation from the object's current state
        instanceObject.userData.settings.position.copy(instanceObject.position);
        instanceObject.userData.settings.rotation.copy(instanceObject.rotation);

        this.instanceCount++;
        const folderName = `${type.charAt(0).toUpperCase() + type.slice(1)} ${this.instanceCount}`;
        const guiFolder = this.gui.addFolder(folderName);
        instanceObject.userData.guiFolder = guiFolder;

        this.createGuiControls(instanceObject, guiFolder); // Create GUI controls

        guiFolder.open(); // Keep the new instance GUI open

        this.scene.add(instanceObject);
        this.instances.push(instanceObject);
        this.selectInstance(instanceObject); // Select the newly added instance
        return instanceObject;
    }

    createGuiControls(instanceObject, guiFolder) {
        const settings = instanceObject.userData.settings;
        const type = settings.type;
        const controllers = []; // Local array

        controllers.push(
            guiFolder.add(settings, 'visible').name("Visible").onChange(val => instanceObject.visible = val),
            guiFolder.add(settings, 'audioInfluence', 0, 2).name("Audio Influence").step(0.1),
            guiFolder.add(settings, 'frequencyRange', ['low', 'mid', 'high']).name("Audio Freq Range"),
            guiFolder.add(settings, 'motionInfluenceFactor', 0, 1).name("Motion Influence").step(0.05)
        );

        if (type === 'grid') {
            const material = instanceObject.material;
            controllers.push(
                guiFolder.add(settings, 'wireframe').name("Wireframe").onChange(val => material.wireframe = val),
                guiFolder.add(settings, 'heightScale', 0.1, 10).name("Height Scale").step(0.1),
                guiFolder.add(settings, 'decayRate', 0.9, 0.999).name("Poke Decay").step(0.001),
                guiFolder.add(settings, 'pokeStrength', 0.05, 1.0).name("Poke Strength").step(0.05),
                guiFolder.add(settings, 'pokeRadius', 0.5, 5.0).name("Poke Radius").step(0.1),
                guiFolder.add(settings, 'colorMapping', ['height', 'audio', 'combined', 'frequencyBands']).name("Color Mapping"),
                guiFolder.add(settings, 'wavePattern', ['radial', 'linear', 'random', 'sineWave', 'checkerboard']).name("Wave Pattern")
            );
        } else if (type === 'pointcloud') {
            const material = instanceObject.material;
             controllers.push(
                guiFolder.add(settings, 'particleSize', 0.01, 1.0).name("Particle Size").step(0.01).onChange(val => material.size = val),
                // TODO: Add particleCount control? Requires recreating geometry. Defer for now.
                // guiFolder.add(settings, 'particleCount', 100, 20000).name("Particle Count").step(100).onChange(val => this.recreatePointCloud(instanceObject, val)),
                guiFolder.add(settings, 'distribution', ['sphere', 'cube', 'plane']).name("Distribution").onChange(val => this.resetPointCloudDistribution(instanceObject)),
                guiFolder.add(settings, 'distributionScale', 1, 50).name("Dist Scale").step(1).onChange(val => this.resetPointCloudDistribution(instanceObject)),
                guiFolder.add(settings, 'displacementScale', 0, 10).name("Displace Scale").step(0.1),
                guiFolder.add(settings, 'colorMapping', ['audio', 'frequencyBands']).name("Color Mapping") // Simplified options for points
             );
        }

        // Common Color Controls
        controllers.push(
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
        settings.resetFunc = () => { this.resetToDefaults(instanceObject); };
        controllers.push(guiFolder.add(settings, 'resetFunc').name("Reset Settings"));

        instanceObject.userData.controllers = controllers; // Store controllers
    }

    resetToDefaults(instance) {
        if (!instance) return;

        const type = instance.userData.settings.type;
        const defaults = this.templates[type].defaultSettings;
        const settings = instance.userData.settings;

        // Reset settings to defaults (handle colors separately)
        for (const key in defaults) {
            if (!['lowColor', 'midColor', 'highColor', 'position', 'rotation', 'type'].includes(key) && typeof defaults[key] !== 'function') {
                 if (settings.hasOwnProperty(key)) {
                    // Use JSON parse/stringify for a deep copy of potential nested objects/arrays if any
                    settings[key] = JSON.parse(JSON.stringify(defaults[key]));
                 }
            }
        }
        // Reset colors
        settings.lowColor.copy(defaults.lowColor);
        settings.midColor.copy(defaults.midColor);
        settings.highColor.copy(defaults.highColor);

        // Reset specific material properties
        if (type === 'grid') {
            instance.material.wireframe = settings.wireframe;
            // Reset target heights
            instance.userData.targetHeights.fill(0);
        } else if (type === 'pointcloud') {
             instance.material.size = settings.particleSize;
             this.resetPointCloudDistribution(instance); // Reset positions based on new settings
        }


        // Update GUI controllers
        instance.userData.controllers.forEach(controller => {
            if (controller.property !== 'resetFunc') {
                 controller.updateDisplay();
            }
        });

        console.log(`Instance ${instance.uuid} (${type}) settings reset to defaults.`);
    }

    // Helper to reset point cloud positions based on current settings
    resetPointCloudDistribution(instance) {
        if (!instance || instance.userData.settings.type !== 'pointcloud') return;

        const settings = instance.userData.settings;
        const geometry = instance.geometry;
        const positions = geometry.attributes.position.array;
        const initialPositions = geometry.userData.initialPositions; // Get stored initial positions

        // Recalculate initial positions based on current distribution settings
        const particleCount = settings.particleCount; // Use the count from settings
        const distributionScale = settings.distributionScale;

        for (let i = 0; i < particleCount; i++) {
             let x, y, z;
             switch (settings.distribution) {
                 case 'cube':
                     x = (Math.random() - 0.5) * distributionScale;
                     y = (Math.random() - 0.5) * distributionScale;
                     z = (Math.random() - 0.5) * distributionScale;
                     break;
                 case 'plane':
                      x = (Math.random() - 0.5) * distributionScale;
                      y = 0;
                      z = (Math.random() - 0.5) * distributionScale;
                      break;
                 case 'sphere':
                 default:
                     const theta = Math.random() * Math.PI * 2;
                     const phi = Math.acos((Math.random() * 2) - 1);
                     const radius = Math.random() * distributionScale / 2;
                     x = radius * Math.sin(phi) * Math.cos(theta);
                     y = radius * Math.sin(phi) * Math.sin(theta);
                     z = radius * Math.cos(phi);
                     break;
             }
             // Update initial positions store
             initialPositions[i * 3] = x;
             initialPositions[i * 3 + 1] = y;
             initialPositions[i * 3 + 2] = z;
             // Also reset current positions
             positions[i * 3] = x;
             positions[i * 3 + 1] = y;
             positions[i * 3 + 2] = z;
        }
        geometry.attributes.position.needsUpdate = true;
        console.log(`Instance ${instance.uuid} point cloud distribution reset.`);
    }


    deleteCurrent() {
        if (!this.currentInstance) return;

        const instanceToDelete = this.currentInstance;
        const index = this.instances.indexOf(instanceToDelete);

        if (index > -1) {
            // Detach transform controls first
            if (this.transformControls && this.transformControls.object === instanceToDelete) {
                this.transformControls.detach();
                // Visibility is handled automatically by detach/attach
            }

            // Remove GUI folder and its controllers
            const guiFolder = instanceToDelete.userData.guiFolder;
            if (guiFolder) {
                guiFolder.close(); // Close it first
                instanceToDelete.userData.controllers.forEach(controller => {
                    try {
                        guiFolder.remove(controller);
                    } catch (e) {
                        console.warn("Could not remove controller:", controller.property, e);
                    }
                });
                try {
                    this.gui.removeFolder(guiFolder);
                } catch (e) {
                    console.warn("Could not remove GUI folder:", e);
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
                // No need to manually set visibility, attach handles it
            } else if (this.transformControls && !this.currentInstance) {
                 // If no instance is selected, detach should have hidden it.
                 // If detach wasn't called (e.g., deleting last item), explicitly hide.
                 this.transformControls.detach(); // Ensure it's detached and hidden
            }

            console.log(`Instance ${instanceToDelete.uuid} (${instanceToDelete.userData.settings.type}) deleted.`);
        }
    }


    selectInstance(instance) {
        if (this.instances.includes(instance)) {
            console.log(`[ObjectManager] Selecting instance: ${instance.uuid} (${instance.userData.settings.type})`); // Debug log
            // Close previously selected instance's GUI folder
            if (this.currentInstance && this.currentInstance !== instance && this.currentInstance.userData.guiFolder) {
                 this.currentInstance.userData.guiFolder.close();
            }

            this.currentInstance = instance;
            if (this.transformControls) {
                console.log(`[ObjectManager] Attaching transform controls to ${instance.uuid}`); // Debug log
                this.transformControls.attach(instance);
                console.log(`[ObjectManager] Transform controls visible after attach: ${this.transformControls.visible}`); // ADDED LOG
                // Attach should make the controls visible automatically
            } else {
                 console.warn("[ObjectManager] Transform controls not available for attachment."); // Debug log
            }
            // Open the newly selected instance's GUI folder
            if (this.currentInstance.userData.guiFolder) {
                this.currentInstance.userData.guiFolder.open();
            }
            console.log(`[ObjectManager] Selected instance: ${instance.uuid}`);
        } else {
             console.warn("[ObjectManager] Attempted to select an instance not managed by ObjectManager.");
        }
    }

    setupTransformControls(camera, renderer, orbitControls) {
        this.orbitControls = orbitControls; // Store reference
        this.transformControls = new TransformControls(camera, renderer.domElement);
        this.transformControls.enabled = true; // ADDED: Explicitly enable
        // Visibility is handled by attach/detach, start detached (invisible)

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

        // Add the transform controls OBJECT to the scene for interaction
        this.scene.add(this.transformControls);
        console.log("[ObjectManager] Transform controls object added to scene."); // Debug log
        // ALSO add the helper explicitly to ensure visibility based on user feedback
        this.scene.add(this.transformControls.getHelper());
        console.log("[ObjectManager] Transform controls helper added to scene."); // Debug log

        // Select the first instance if available after setup
        if (this.instances.length > 0) {
            this.selectInstance(this.instances[0]);
        } else {
            // Ensure controls are hidden if no initial instance exists
            this.transformControls.detach(); // Detach should hide helper
        }
    }

    setTransformMode(mode) {
        if (this.transformControls) {
            this.transformControls.setMode(mode);
        }
    }

    // --- Update Logic ---

    updateObject(instance, audioManager, motionScore, cameraSettings) {
        const settings = instance.userData.settings;
        if (!settings.visible) return;

        const type = settings.type;

        if (type === 'grid') {
            this.updateGridGeometry(instance, audioManager, motionScore, cameraSettings);
        } else if (type === 'pointcloud') {
            this.updatePointCloudGeometry(instance, audioManager, motionScore, cameraSettings);
        }
    }

    updateGridGeometry(grid, audioManager, motionScore, cameraSettings) {
        const settings = grid.userData.settings;
        const frequencyData = audioManager.getFrequencyRangeData(settings.frequencyRange);
        const vertices = grid.geometry.attributes.position.array;
        const colors = grid.geometry.attributes.color.array;
        const targetHeights = grid.userData.targetHeights;

        const size = grid.geometry.parameters.width;
        const segments = grid.geometry.parameters.widthSegments;
        const verticesPerSide = segments + 1;
        const halfSize = size / 2;
        const maxDistance = Math.sqrt(halfSize * halfSize + halfSize * halfSize);

        // Calculate effective parameters based on motion
        let effectiveHeightScale = settings.heightScale;
        let effectiveDecayRate = settings.decayRate;
        if (cameraSettings.cameraMotionEnabled && audioManager.audioContext && settings.motionInfluenceFactor > 0) { // Check audio context too
            const influence = motionScore * settings.motionInfluenceFactor;
            effectiveHeightScale = settings.heightScale * (1 + influence);
            effectiveDecayRate = settings.decayRate + (1.0 - settings.decayRate) * influence * 0.5;
            effectiveDecayRate = Math.min(effectiveDecayRate, 0.999);
        }

        // Get frequency band data if needed
        let lowAmp = 0, midAmp = 0, highAmp = 0;
        const useFreqBands = settings.colorMapping === 'frequencyBands' || settings.wavePattern === 'checkerboard';
        if (useFreqBands && audioManager.audioContext) {
            lowAmp = audioManager.getAverageAmplitude('low');
            midAmp = audioManager.getAverageAmplitude('mid');
            highAmp = audioManager.getAverageAmplitude('high');
        }

        const time = performance.now() * 0.002;
        const tempColor = new THREE.Color(); // Reuse color object

        for (let i = 0; i < targetHeights.length; i++) {
            const x = (i % verticesPerSide) * (size / segments) - halfSize;
            const y = Math.floor(i / verticesPerSide) * (size / segments) - halfSize;

            let audioValue = 0;
            let patternHeight = 0;

            if (frequencyData.length > 0 && audioManager.audioContext) {
                switch (settings.wavePattern) {
                    case 'radial':
                        const distance = Math.sqrt(x * x + y * y);
                        const normalizedDistance = Math.min(distance / maxDistance, 1.0);
                        const index = Math.floor(normalizedDistance * (frequencyData.length - 1));
                        audioValue = frequencyData[index] || 0;
                        break;
                    case 'linear':
                        audioValue = frequencyData[i % frequencyData.length] || 0;
                        break;
                    case 'random':
                        audioValue = frequencyData[Math.floor(Math.random() * frequencyData.length)] || 0;
                        break;
                    case 'sineWave':
                        const distFromCenter = Math.sqrt(x * x + y * y);
                        const avgMidAmpNorm = midAmp / 255;
                        patternHeight = Math.sin(distFromCenter * (1 + avgMidAmpNorm * 2) - time * (1 + avgMidAmpNorm * 5)) * (0.5 + avgMidAmpNorm);
                        audioValue = audioManager.getAverageAmplitude(settings.frequencyRange);
                        break;
                    case 'checkerboard':
                        const scale = 4.0;
                        const checkX = Math.floor((x + halfSize) / scale);
                        const checkY = Math.floor((y + halfSize) / scale);
                        audioValue = ((checkX + checkY) % 2 === 0) ? lowAmp : highAmp;
                        break;
                    default:
                        audioValue = frequencyData[i % frequencyData.length] || 0;
                }
            }

            const audioHeight = (audioValue / 255) * effectiveHeightScale * settings.audioInfluence;
            const totalPatternHeight = audioHeight + (patternHeight * effectiveHeightScale * settings.audioInfluence);

            targetHeights[i] *= effectiveDecayRate;
            if (targetHeights[i] < 0.01) targetHeights[i] = 0;

            const finalHeight = Math.max(targetHeights[i], totalPatternHeight);
            vertices[i * 3 + 2] = finalHeight;

            // --- Color Calculation ---
            let colorFactor = 0;
            const normalizedHeight = finalHeight / effectiveHeightScale;
            const normalizedAudio = audioValue / 255;

            switch (settings.colorMapping) {
                case 'height':
                    colorFactor = THREE.MathUtils.clamp(normalizedHeight, 0, 1);
                    break;
                case 'audio':
                    colorFactor = THREE.MathUtils.clamp(normalizedAudio, 0, 1);
                    break;
                case 'combined':
                    colorFactor = THREE.MathUtils.clamp((normalizedHeight + normalizedAudio) / 2, 0, 1);
                    break;
                case 'frequencyBands':
                    tempColor.setRGB(0, 0, 0);
                    if (audioManager.audioContext) {
                        tempColor.lerp(settings.lowColor, lowAmp / 255);
                        tempColor.lerp(settings.midColor, midAmp / 255);
                        tempColor.lerp(settings.highColor, highAmp / 255);
                    } else {
                        tempColor.copy(settings.midColor);
                    }
                    break;
            }

            if (settings.colorMapping !== 'frequencyBands') {
                if (colorFactor < 0.5) {
                    tempColor.lerpColors(settings.lowColor, settings.midColor, colorFactor * 2);
                } else {
                    tempColor.lerpColors(settings.midColor, settings.highColor, (colorFactor - 0.5) * 2);
                }
            }

            colors[i * 3] = tempColor.r;
            colors[i * 3 + 1] = tempColor.g;
            colors[i * 3 + 2] = tempColor.b;
        }

        grid.geometry.attributes.position.needsUpdate = true;
        grid.geometry.attributes.color.needsUpdate = true;
        grid.geometry.computeVertexNormals();
    }

    updatePointCloudGeometry(points, audioManager, motionScore, cameraSettings) {
        const settings = points.userData.settings;
        const geometry = points.geometry;
        const positions = geometry.attributes.position.array;
        const colors = geometry.attributes.color.array;
        const initialPositions = geometry.userData.initialPositions;
        const particleCount = settings.particleCount;

        const frequencyData = audioManager.getFrequencyRangeData(settings.frequencyRange);
        const averageAmplitude = audioManager.getAverageAmplitude(settings.frequencyRange); // Normalized 0-255

        // Calculate effective parameters based on motion
        let effectiveDisplacementScale = settings.displacementScale;
        if (cameraSettings.cameraMotionEnabled && audioManager.audioContext && settings.motionInfluenceFactor > 0) {
            const influence = motionScore * settings.motionInfluenceFactor;
            effectiveDisplacementScale = settings.displacementScale * (1 + influence);
        }

        // Get frequency band data if needed
        let lowAmpNorm = 0, midAmpNorm = 0, highAmpNorm = 0;
        if (settings.colorMapping === 'frequencyBands' && audioManager.audioContext) {
            lowAmpNorm = audioManager.getAverageAmplitude('low') / 255;
            midAmpNorm = audioManager.getAverageAmplitude('mid') / 255;
            highAmpNorm = audioManager.getAverageAmplitude('high') / 255;
        }

        const tempColor = new THREE.Color(); // Reuse color object
        const directionVector = new THREE.Vector3(); // Reuse vector object

        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;

            // --- Position Calculation ---
            const initialX = initialPositions[i3];
            const initialY = initialPositions[i3 + 1];
            const initialZ = initialPositions[i3 + 2];

            let displacement = 0;
            if (frequencyData.length > 0 && audioManager.audioContext) {
                // Use average amplitude for overall displacement magnitude
                const normalizedAvgAmp = averageAmplitude / 255;
                displacement = normalizedAvgAmp * effectiveDisplacementScale * settings.audioInfluence;
            }

            // Calculate direction from origin to initial position
            directionVector.set(initialX, initialY, initialZ).normalize();

            // Apply displacement along the direction vector
            positions[i3] = initialX + directionVector.x * displacement;
            positions[i3 + 1] = initialY + directionVector.y * displacement;
            positions[i3 + 2] = initialZ + directionVector.z * displacement;


            // --- Color Calculation ---
            let colorFactor = 0;
            const normalizedAudio = averageAmplitude / 255; // Use average amplitude for color

            switch (settings.colorMapping) {
                case 'audio':
                    colorFactor = THREE.MathUtils.clamp(normalizedAudio, 0, 1);
                    break;
                case 'frequencyBands':
                    tempColor.setRGB(0, 0, 0);
                    if (audioManager.audioContext) {
                        tempColor.lerp(settings.lowColor, lowAmpNorm);
                        tempColor.lerp(settings.midColor, midAmpNorm);
                        tempColor.lerp(settings.highColor, highAmpNorm);
                    } else {
                        tempColor.copy(settings.midColor); // Default color if no audio
                    }
                    break;
            }

            if (settings.colorMapping !== 'frequencyBands') {
                 if (colorFactor < 0.5) {
                     tempColor.lerpColors(settings.lowColor, settings.midColor, colorFactor * 2);
                 } else {
                     tempColor.lerpColors(settings.midColor, settings.highColor, (colorFactor - 0.5) * 2);
                 }
            }

            colors[i3] = tempColor.r;
            colors[i3 + 1] = tempColor.g;
            colors[i3 + 2] = tempColor.b;
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
        // No normals needed for points
    }


    // --- Cleanup ---

    dispose() {
        console.log("Disposing ObjectManager...");
        if (this.transformControls) {
            // Remove helper first if it was added separately
            const helper = this.transformControls.getHelper(); // Get helper reference
            if (helper && helper.parent) { // Check if helper exists and is in scene
                 this.scene.remove(helper);
                 console.log("[ObjectManager] Transform controls helper removed from scene.");
            }
            this.transformControls.dispose();
            // Remove the main control object from the scene
            if (this.transformControls.parent) { // Check if main control object is in scene
                this.scene.remove(this.transformControls);
                console.log("[ObjectManager] Transform controls object removed from scene.");
            }
        }
        // Use deleteCurrent repeatedly to ensure proper cleanup
        while (this.instances.length > 0) {
             this.selectInstance(this.instances[0]); // Select first to delete
             this.deleteCurrent();
        }
        this.instances = [];
        this.currentInstance = null;
        this.templates = {}; // Clear templates

        // Consider removing the main GUI object if ObjectManager owned it
        // this.gui.destroy();
    }
}
