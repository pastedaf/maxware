import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import * as dat from 'https://cdn.skypack.dev/dat.gui';

// Default settings structure
const defaultSettings = {
    grid: {
        type: 'grid',
        audioInfluence: 1.0,
        heightScale: 3,
        colorMapping: 'height', // 'height', 'audio', 'combined', 'frequencyBands'
        wavePattern: 'radial', // 'radial', 'linear', 'random', 'sineWave', 'checkerboard', 'ripple'
        frequencyRange: 'mid', // 'low', 'mid', 'high'
        visible: true,
        wireframe: false,
        motionInfluenceFactor: 0.5,
        lowColor: new THREE.Color(0x003300),
        midColor: new THREE.Color(0x00ff00),
        highColor: new THREE.Color(0xffffff),
        position: new THREE.Vector3(),
        rotation: new THREE.Euler(),
        autoRotate: false, // Added
        rotationSpeed: new THREE.Vector3(0, 0, 0) // Added (radians per second)
        // Note: Grid size/segments are constructor params, not instance settings
    },
    pointcloud: {
        type: 'pointcloud',
        particleCount: 5000, // Note: Changing this requires recreating the object currently
        particleSize: 0.1,
        distribution: 'sphere', // 'sphere', 'cube', 'plane'
        distributionScale: 10, // Size of the sphere/cube/plane
        audioInfluence: 1.0,
        displacementScale: 2.0, // How much audio displaces points
        displacementMode: 'radial', // 'radial', 'frequencyBandDisplacement'
        colorMapping: 'audio', // 'audio', 'frequencyBands'
        frequencyRange: 'mid', // 'low', 'mid', 'high' (used for 'radial' displacement and 'audio' color)
        visible: true,
        motionInfluenceFactor: 0.3,
        lowColor: new THREE.Color(0x0000ff), // Blue
        midColor: new THREE.Color(0x00ffff), // Cyan
        highColor: new THREE.Color(0xffffff), // White
        position: new THREE.Vector3(),
        rotation: new THREE.Euler(),
        autoRotate: false, // Added
        rotationSpeed: new THREE.Vector3(0, 0, 0) // Added
    },
    sphere: {
        type: 'sphere',
        radius: 5,
        widthSegments: 32,
        heightSegments: 16,
        audioInfluence: 1.0,
        displacementScale: 1.5,
        colorMapping: 'audio', // 'audio', 'frequencyBands', 'normal'
        frequencyRange: 'mid', // 'low', 'mid', 'high'
        visible: true,
        wireframe: false,
        motionInfluenceFactor: 0.4,
        lowColor: new THREE.Color(0xff8800), // Orange
        midColor: new THREE.Color(0xffff00), // Yellow
        highColor: new THREE.Color(0xffffff), // White
        position: new THREE.Vector3(),
        rotation: new THREE.Euler(),
        autoRotate: false, // Added
        rotationSpeed: new THREE.Vector3(0, 0, 0) // Added
    },
    torus: {
        type: 'torus',
        radius: 5,
        tube: 2,
        radialSegments: 16,
        tubularSegments: 32,
        audioInfluence: 1.0,
        displacementScale: 1.0,
        colorMapping: 'audio', // 'audio', 'frequencyBands', 'normal'
        frequencyRange: 'mid', // 'low', 'mid', 'high'
        visible: true,
        wireframe: false,
        motionInfluenceFactor: 0.4,
        lowColor: new THREE.Color(0x8800ff), // Purple
        midColor: new THREE.Color(0xff00ff), // Magenta
        highColor: new THREE.Color(0xffffff), // White
        position: new THREE.Vector3(),
        rotation: new THREE.Euler(),
        autoRotate: false, // Added
        rotationSpeed: new THREE.Vector3(0, 0, 0) // Added
    },
    torusknot: {
        type: 'torusknot',
        radius: 4,
        tube: 1,
        tubularSegments: 64,
        radialSegments: 8,
        p: 2,
        q: 3,
        audioInfluence: 1.0,
        displacementScale: 0.5,
        colorMapping: 'audio', // 'audio', 'frequencyBands', 'normal'
        frequencyRange: 'mid', // 'low', 'mid', 'high'
        visible: true,
        wireframe: false,
        motionInfluenceFactor: 0.4,
        lowColor: new THREE.Color(0xff0000), // Red
        midColor: new THREE.Color(0xffaa00), // Orange-Red
        highColor: new THREE.Color(0xffffff), // White
        position: new THREE.Vector3(),
        rotation: new THREE.Euler(),
        autoRotate: false, // Added
        rotationSpeed: new THREE.Vector3(0, 0, 0) // Added
    },
    dancingcubes: { // Renamed from dancingCubes to dancingcubes to match convention
        type: 'dancingcubes',
        cubeCount: 27, // e.g., 3x3x3 grid
        arrangement: 'grid', // 'grid', 'sphere', 'random'
        cubeSize: 0.5,
        overallScale: 5,
        audioInfluence: 1.0,
        frequencyRange: 'mid',
        motionInfluenceFactor: 0.2,
        colorMapping: 'audio', // 'audio', 'frequencyBands', 'individual'
        effectMode: 'scale', // 'scale', 'rotate', 'position', 'combination'
        lowColor: new THREE.Color(0x0055aa), // Bluish
        midColor: new THREE.Color(0x00aaff), // Lighter Blue
        highColor: new THREE.Color(0xaaddff), // Very Light Blue
        visible: true,
        position: new THREE.Vector3(),
        rotation: new THREE.Euler(),
        autoRotate: false,
        rotationSpeed: new THREE.Vector3(0, 0, 0)
    }
};


export class ObjectManager {
    constructor(scene, gui, gridSize = 15, gridSegments = 63) {
        this.scene = scene;
        this.gui = gui;
        // Grid defaults (used only for grid template)
        this.gridSize = gridSize;
        this.gridSegments = gridSegments;
        this.gridVerticesCount = (this.gridSegments + 1) * (this.gridSegments + 1);
        // ---
        this.instances = [];
        this.currentInstance = null;
        this.transformControls = null;
        this.orbitControls = null; // Reference to OrbitControls needed for enabling/disabling
        this.templates = {
            grid: this.createGridTemplate(),
            pointcloud: this.createPointCloudTemplate(),
            sphere: this.createSphereTemplate(),
            torus: this.createTorusTemplate(),
            torusknot: this.createTorusKnotTemplate(),
            dancingcubes: this.createDancingCubesTemplate()
        };
        this.instanceCount = 0;

        // For interaction logic within ObjectManager
        this.camera = null; // Will be set in setupTransformControls
        this.rendererElement = null; // Will be set in setupTransformControls
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.onDownPosition = new THREE.Vector2();
        this.onUpPosition = new THREE.Vector2();

        // Store bound event listeners for removal
        this.boundOnPointerDown = null;
        this.boundOnPointerMove = null;
        this.boundOnPointerUp = null;
    }

    // --- Template Creation ---

    createGridTemplate() {
        const geometry = new THREE.PlaneGeometry(this.gridSize, this.gridSize, this.gridSegments, this.gridSegments);
        const colors = new Float32Array(this.gridVerticesCount * 3);
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        // Keep original Z positions (which are 0 for PlaneGeometry)
        geometry.userData = {
             originalZ: new Float32Array(this.gridVerticesCount).fill(0),
             // No initial positions/normals needed for grid as displacement is only Z
        };

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

        // Calculate initial positions (will be done properly in resetObjectInitialGeometry)
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.userData = { initialPositions }; // Store for reference

        const material = new THREE.PointsMaterial({
            size: settings.particleSize,
            vertexColors: true,
            sizeAttenuation: true
        });

        // Populate initial positions based on default settings
        this.resetObjectInitialGeometry({ geometry, userData: { settings } });

        return {
            geometry,
            material,
            defaultSettings: settings
        };
    }

    createSphereTemplate() {
        const settings = defaultSettings.sphere;
        const geometry = new THREE.SphereGeometry(settings.radius, settings.widthSegments, settings.heightSegments);
        const numVertices = geometry.attributes.position.count;
        const colors = new Float32Array(numVertices * 3);
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // Store initial positions and normals
        geometry.userData = {
            initialPositions: new Float32Array(geometry.attributes.position.array),
            initialNormals: new Float32Array(geometry.attributes.normal.array)
        };

        const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            wireframe: settings.wireframe,
            flatShading: true, // Looks interesting on spheres
            emissive: 0x111111,
            specular: 0xcccccc,
            shininess: 50,
            side: THREE.DoubleSide
        });

        return {
            geometry,
            material,
            defaultSettings: settings
        };
    }

    createTorusTemplate() {
        const settings = defaultSettings.torus;
        const geometry = new THREE.TorusGeometry(settings.radius, settings.tube, settings.radialSegments, settings.tubularSegments);
        const numVertices = geometry.attributes.position.count;
        const colors = new Float32Array(numVertices * 3);
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // Store initial positions and normals
        geometry.userData = {
            initialPositions: new Float32Array(geometry.attributes.position.array),
            initialNormals: new Float32Array(geometry.attributes.normal.array)
        };

        const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            wireframe: settings.wireframe,
            flatShading: true,
            emissive: 0x110011,
            specular: 0xcc00cc,
            shininess: 50,
            side: THREE.DoubleSide
        });

        return {
            geometry,
            material,
            defaultSettings: settings
        };
    }

    createTorusKnotTemplate() {
        const settings = defaultSettings.torusknot;
        const geometry = new THREE.TorusKnotGeometry(
            settings.radius,
            settings.tube,
            settings.tubularSegments,
            settings.radialSegments,
            settings.p,
            settings.q
        );
        const numVertices = geometry.attributes.position.count;
        const colors = new Float32Array(numVertices * 3);
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // Store initial positions and normals
        geometry.userData = {
            initialPositions: new Float32Array(geometry.attributes.position.array),
            initialNormals: new Float32Array(geometry.attributes.normal.array)
        };

        const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            wireframe: settings.wireframe,
            flatShading: true,
            emissive: 0x220500,
            specular: 0xff4400,
            shininess: 50,
            side: THREE.DoubleSide
        });

        return {
            geometry,
            material,
            defaultSettings: settings
        };
    }

    createDancingCubesTemplate() {
        const settings = defaultSettings.dancingcubes;
        // The "geometry" for a DancingCubes group is just a Group object.
        // Individual cube geometries will be created when an instance is made.
        // The material here is a placeholder or could be a shared material if desired.
        const group = new THREE.Group(); // The "geometry" is the group itself.
        group.userData = {
            // Store initial relative positions of sub-cubes here if needed for reset,
            // or calculate them on the fly in resetObjectInitialGeometry.
            // For now, we'll calculate them dynamically.
            subCubes: [] // Will hold references to the actual cube meshes
        };

        // A default material for the cubes (can be overridden or individualized later)
        const material = new THREE.MeshPhongMaterial({
            color: 0xffffff, // Default white, will be changed by vertex colors or instance settings
            vertexColors: true, // If we decide to color individual cubes' vertices
            flatShading: true,
            emissive: 0x111111,
            specular: 0xaaaaaa,
            shininess: 30,
        });

        return {
            geometry: group, // The "geometry" is the group
            material: material, // A base material for sub-cubes
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
        let geometry, material, instanceObject;

        if (type === 'dancingcubes') {
            // For dancingcubes, the "geometry" is a Group.
            // We clone the group (which is lightweight) and the base material for sub-cubes.
            instanceObject = template.geometry.clone(); // Clones the THREE.Group
            material = template.material.clone(); // This is the material for sub-cubes
            instanceObject.userData = { subCubes: [] }; // Ensure fresh subCubes array
        } else {
            geometry = template.geometry.clone();
            material = template.material.clone();

            // Ensure attributes are cloned properly for independent modification
            if (geometry.attributes) { // Check if attributes exist (e.g. not for a simple Group)
                if (geometry.attributes.position) {
                    geometry.attributes.position = geometry.attributes.position.clone();
                    geometry.attributes.position.array = new Float32Array(geometry.attributes.position.array);
                }
                if (geometry.attributes.color) {
                    geometry.attributes.color = geometry.attributes.color.clone();
                    geometry.attributes.color.array = new Float32Array(geometry.attributes.color.array);
                }
                if (geometry.attributes.normal && type !== 'pointcloud') {
                     geometry.attributes.normal = geometry.attributes.normal.clone();
                     geometry.attributes.normal.array = new Float32Array(geometry.attributes.normal.array);
                }
            }


            // Clone userData deeply for arrays
            geometry.userData = {};
            for (const key in template.geometry.userData) {
                if (template.geometry.userData[key] instanceof Float32Array) {
                    geometry.userData[key] = new Float32Array(template.geometry.userData[key]);
                } else {
                    // Avoid cloning subCubes array directly here, it's handled for dancingcubes specifically
                    if (key !== 'subCubes') {
                         geometry.userData[key] = JSON.parse(JSON.stringify(template.geometry.userData[key]));
                    }
                }
            }

            if (type === 'grid') {
                instanceObject = new THREE.Mesh(geometry, material);
                instanceObject.rotation.x = -Math.PI / 2; // Default grid orientation
            } else if (type === 'pointcloud') {
                instanceObject = new THREE.Points(geometry, material);
            } else if (type === 'sphere' || type === 'torus' || type === 'torusknot') {
                instanceObject = new THREE.Mesh(geometry, material);
            } else {
                 console.error(`Unhandled object type for mesh/points creation: ${type}`);
                 return null;
            }
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
        newSettings.rotationSpeed = new THREE.Vector3().copy(sourceSettings.rotationSpeed); // Clone rotation speed
        newSettings.type = type; // Ensure type is set

        // Apply specific material properties from settings
        if (type === 'grid' || type === 'sphere' || type === 'torus' || type === 'torusknot') {
            material.wireframe = newSettings.wireframe;
        } else if (type === 'pointcloud') {
            material.size = newSettings.particleSize;
        }
        // For dancingcubes, the main 'material' is for sub-cubes, managed in resetObjectInitialGeometry/update.

        instanceObject.userData = { // For all types, instanceObject is the root (Mesh, Points, or Group)
            settings: newSettings,
            guiFolder: null,
            controllers: [], // To keep track of GUI controllers for removal
            // For dancingcubes, subCubes will be populated in resetObjectInitialGeometry
        };
        if (type === 'dancingcubes') {
            instanceObject.userData.subCubeMaterial = material; // Store the sub-cube material reference
        }


        // If cloning, copy transform AFTER setting up userData
        if (baseInstance) {
            instanceObject.position.copy(baseInstance.position);
            instanceObject.rotation.copy(baseInstance.rotation);
            // Also copy autoRotate state if cloning
            newSettings.autoRotate = sourceSettings.autoRotate;
        }
        // Initialize settings position/rotation from the object's current state
        instanceObject.userData.settings.position.copy(instanceObject.position);
        instanceObject.userData.settings.rotation.copy(instanceObject.rotation);

        // If it's a point cloud, sphere, torus, torus knot, or dancingcubes, ensure its initial geometry matches its settings
        if (type === 'pointcloud' || type === 'sphere' || type === 'torus' || type === 'torusknot' || type === 'dancingcubes') {
             this.resetObjectInitialGeometry(instanceObject);
        }


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

        // --- Basic Controls ---
        controllers.push(
            guiFolder.add(settings, 'visible').name("Visible").onChange(val => instanceObject.visible = val),
            guiFolder.add(settings, 'audioInfluence', 0, 2).name("Audio Influence").step(0.1),
            guiFolder.add(settings, 'frequencyRange', ['low', 'mid', 'high']).name("Audio Freq Range"),
            guiFolder.add(settings, 'motionInfluenceFactor', 0, 1).name("Motion Influence").step(0.05)
        );

        // --- Material Controls ---
        if (type === 'grid' || type === 'sphere' || type === 'torus' || type === 'torusknot') {
             const material = instanceObject.material;
             controllers.push(
                 guiFolder.add(settings, 'wireframe').name("Wireframe").onChange(val => material.wireframe = val)
             );
        }

        // --- Type-Specific Geometry/Behavior Controls ---
        if (type === 'grid') {
            controllers.push(
                guiFolder.add(settings, 'heightScale', 0.1, 10).name("Height Scale").step(0.1),
                guiFolder.add(settings, 'colorMapping', ['height', 'audio', 'combined', 'frequencyBands']).name("Color Mapping"),
                guiFolder.add(settings, 'wavePattern', ['radial', 'linear', 'random', 'sineWave', 'checkerboard', 'ripple']).name("Wave Pattern")
            );
        } else if (type === 'pointcloud') {
            const material = instanceObject.material;
             controllers.push(
                guiFolder.add(settings, 'particleSize', 0.01, 1.0).name("Particle Size").step(0.01).onChange(val => material.size = val),
                // Note: particleCount requires recreating geometry, complex to handle via GUI for now
                // guiFolder.add(settings, 'particleCount', 100, 20000).name("Particle Count").step(100).onChange(val => this.recreatePointCloud(instanceObject, val)),
                guiFolder.add(settings, 'distribution', ['sphere', 'cube', 'plane']).name("Distribution").onChange(() => this.resetObjectInitialGeometry(instanceObject)),
                guiFolder.add(settings, 'distributionScale', 1, 50).name("Dist Scale").step(1).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
                guiFolder.add(settings, 'displacementScale', 0, 10).name("Displace Scale").step(0.1),
                guiFolder.add(settings, 'displacementMode', ['radial', 'frequencyBandDisplacement']).name("Displace Mode"),
                guiFolder.add(settings, 'colorMapping', ['audio', 'frequencyBands']).name("Color Mapping")
             );
        } else if (type === 'sphere') {
             controllers.push(
                 guiFolder.add(settings, 'radius', 1, 20).name("Radius").step(0.5).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
                 guiFolder.add(settings, 'widthSegments', 3, 64).name("Width Segments").step(1).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
                 guiFolder.add(settings, 'heightSegments', 2, 32).name("Height Segments").step(1).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
                 guiFolder.add(settings, 'displacementScale', 0, 5).name("Displace Scale").step(0.1),
                 guiFolder.add(settings, 'colorMapping', ['audio', 'frequencyBands', 'normal']).name("Color Mapping")
             );
        } else if (type === 'torus') {
             controllers.push(
                 guiFolder.add(settings, 'radius', 1, 20).name("Radius").step(0.5).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
                 guiFolder.add(settings, 'tube', 0.1, 10).name("Tube Radius").step(0.1).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
                 guiFolder.add(settings, 'radialSegments', 3, 64).name("Radial Segments").step(1).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
                 guiFolder.add(settings, 'tubularSegments', 3, 64).name("Tubular Segments").step(1).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
                 guiFolder.add(settings, 'displacementScale', 0, 5).name("Displace Scale").step(0.1),
                 guiFolder.add(settings, 'colorMapping', ['audio', 'frequencyBands', 'normal']).name("Color Mapping")
             );
        } else if (type === 'torusknot') {
             controllers.push(
                 guiFolder.add(settings, 'radius', 1, 20).name("Radius").step(0.5).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
                 guiFolder.add(settings, 'tube', 0.1, 10).name("Tube Radius").step(0.1).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
                 guiFolder.add(settings, 'tubularSegments', 8, 256).name("Tubular Seg").step(1).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
                 guiFolder.add(settings, 'radialSegments', 3, 64).name("Radial Seg").step(1).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
                 guiFolder.add(settings, 'p', 1, 10).name("P (windings)").step(1).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
                 guiFolder.add(settings, 'q', 1, 10).name("Q (windings)").step(1).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
                 guiFolder.add(settings, 'displacementScale', 0, 5).name("Displace Scale").step(0.1),
                 guiFolder.add(settings, 'colorMapping', ['audio', 'frequencyBands', 'normal']).name("Color Mapping")
             );
        } else if (type === 'dancingcubes') {
            controllers.push(
                guiFolder.add(settings, 'cubeCount', 1, 216).name("Cube Count").step(1).onChange(() => {
                    this.resetObjectInitialGeometry(instanceObject);
                    // Update GUI if cubeCount was adjusted by resetObjectInitialGeometry (e.g. for grid)
                    // This requires the controller to be stored and updated if settings.cubeCount changes.
                    // For now, we assume the user sees the change on next interaction or we find a way to refresh it.
                    // Potential refresh: instanceObject.userData.controllers.find(c => c.property === 'cubeCount').updateDisplay();
                    // However, this needs careful handling as controller might not be in the array yet.
                }),
                guiFolder.add(settings, 'arrangement', ['grid', 'sphere', 'random']).name("Arrangement").onChange(() => this.resetObjectInitialGeometry(instanceObject)),
                guiFolder.add(settings, 'cubeSize', 0.1, 2).name("Cube Size").step(0.05).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
                guiFolder.add(settings, 'overallScale', 1, 20).name("Overall Scale").step(0.5).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
                guiFolder.add(settings, 'colorMapping', ['audio', 'frequencyBands', 'individual']).name("Color Mapping"),
                guiFolder.add(settings, 'effectMode', ['scale', 'rotate', 'position', 'combination']).name("Effect Mode")
            );
        }

        // --- Rotation Controls (Added) ---
        const rotationFolder = guiFolder.addFolder('Rotation');
        controllers.push(
            rotationFolder.add(settings, 'autoRotate').name("Auto Rotate")
        );
        // Add separate controls for X, Y, Z rotation speed
        controllers.push(
            rotationFolder.add(settings.rotationSpeed, 'x', -Math.PI, Math.PI).name("Speed X").step(0.01)
        );
        controllers.push(
            rotationFolder.add(settings.rotationSpeed, 'y', -Math.PI, Math.PI).name("Speed Y").step(0.01)
        );
        controllers.push(
            rotationFolder.add(settings.rotationSpeed, 'z', -Math.PI, Math.PI).name("Speed Z").step(0.01)
        );
        // rotationFolder.open(); // Optional: Keep rotation folder open by default


        // --- Common Color Controls ---
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

        // --- Reset Button ---
        settings.resetFunc = () => { this.resetToDefaults(instanceObject); };
        controllers.push(guiFolder.add(settings, 'resetFunc').name("Reset Settings"));

        instanceObject.userData.controllers = controllers; // Store controllers
    }

    resetToDefaults(instance) {
        if (!instance) return;

        const type = instance.userData.settings.type;
        const defaults = this.templates[type].defaultSettings;
        const settings = instance.userData.settings;

        // Store current transform
        const currentPosition = instance.position.clone();
        const currentRotation = instance.rotation.clone(); // Store current actual rotation

        // Reset settings to defaults
        for (const key in defaults) {
            if (!['lowColor', 'midColor', 'highColor', 'position', 'rotation', 'rotationSpeed', 'type'].includes(key) && typeof defaults[key] !== 'function') {
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
        // Reset rotation speed
        settings.rotationSpeed.copy(defaults.rotationSpeed); // Reset rotation speed vector

        // Restore transform settings to current object state (don't reset position/rotation)
        settings.position.copy(currentPosition);
        // Reset the settings.rotation Euler to match the current object rotation
        // This prevents the reset from snapping the object's rotation if it was auto-rotating
        settings.rotation.copy(currentRotation);


        // Reset specific material properties
        if (type === 'grid' || type === 'sphere' || type === 'torus' || type === 'torusknot') {
            instance.material.wireframe = settings.wireframe;
        }
        if (type === 'pointcloud') {
             instance.material.size = settings.particleSize;
        }

        // Reset geometry based on new default settings (if applicable)
        if (type === 'pointcloud' || type === 'sphere' || type === 'torus' || type === 'torusknot') {
             this.resetObjectInitialGeometry(instance);
        }
        // For grid, reset Z positions
        if (type === 'grid') {
             const positions = instance.geometry.attributes.position.array;
             const originalZ = instance.geometry.userData.originalZ;
             for (let i = 0; i < originalZ.length; i++) {
                 positions[i * 3 + 2] = originalZ[i]; // Reset Z
             }
             instance.geometry.attributes.position.needsUpdate = true;
             instance.geometry.computeVertexNormals(); // Recompute normals after Z reset
        }


        // Update GUI controllers
        instance.userData.controllers.forEach(controller => {
            // Check if the controller belongs to the rotationSpeed object
            if (controller.object === settings.rotationSpeed) {
                 controller.updateDisplay();
            } else if (controller.property !== 'resetFunc') {
                 controller.updateDisplay();
            }
        });

        console.log(`Instance ${instance.uuid} (${type}) settings reset to defaults.`);
    }

    // Helper to reset point cloud, sphere, torus, or torus knot geometry based on current settings
    resetObjectInitialGeometry(instance) {
        if (!instance) return;

        const settings = instance.userData.settings;
        const type = settings.type;
        const groupOrGeometry = instance; // For dancingcubes, 'instance' is the Group

        console.log(`Resetting initial geometry for ${type} instance ${instance.uuid}`);

        // --- Dancing Cubes Specific ---
        if (type === 'dancingcubes') {
            const group = groupOrGeometry; // instance is the THREE.Group
            const subCubeMaterial = instance.userData.subCubeMaterial;

            // Clear existing sub-cubes from the group and userData
            group.userData.subCubes.forEach(cube => group.remove(cube));
            group.userData.subCubes = [];

            const cubeGeom = new THREE.BoxGeometry(settings.cubeSize, settings.cubeSize, settings.cubeSize);

            let count = Math.round(settings.cubeCount); // Ensure integer
            if (settings.arrangement === 'grid') {
                // Adjust count to be a perfect cube if it's for grid, or just use as is
                const side = Math.cbrt(count);
                const sideInt = Math.round(side);
                // If not a perfect cube, we might want to adjust count or log a warning.
                // For simplicity, we'll use sideInt^3 for grid arrangement.
                count = sideInt * sideInt * sideInt;
                settings.cubeCount = count; // Update settings if adjusted
                // TODO: Update GUI if settings.cubeCount is changed programmatically
            }


            for (let i = 0; i < count; i++) {
                const cube = new THREE.Mesh(cubeGeom, subCubeMaterial.clone()); // Clone material for individual color later if needed
                cube.userData.initialPosition = new THREE.Vector3();
                cube.userData.initialRotation = new THREE.Euler();
                cube.userData.initialScale = new THREE.Vector3(1, 1, 1);

                let x, y, z;
                const scale = settings.overallScale;

                switch (settings.arrangement) {
                    case 'sphere':
                        const phi = Math.acos(-1 + (2 * i) / (count -1 + Number.EPSILON) ); // Distribute points more evenly on sphere
                        const theta = Math.sqrt(count * Math.PI) * phi;
                        x = scale * Math.sin(phi) * Math.cos(theta);
                        y = scale * Math.sin(phi) * Math.sin(theta);
                        z = scale * Math.cos(phi);
                        break;
                    case 'random':
                        x = (Math.random() - 0.5) * 2 * scale;
                        y = (Math.random() - 0.5) * 2 * scale;
                        z = (Math.random() - 0.5) * 2 * scale;
                        break;
                    case 'grid':
                    default:
                        const sideLength = Math.cbrt(count);
                        const layer = Math.floor(i / (sideLength * sideLength));
                        const rowInLayer = Math.floor((i % (sideLength * sideLength)) / sideLength);
                        const colInRow = (i % (sideLength * sideLength)) % sideLength;

                        // Center the grid
                        const offset = (sideLength - 1) / 2;
                        x = (colInRow - offset) * (scale / Math.max(1, sideLength -1) );
                        y = (rowInLayer - offset) * (scale / Math.max(1, sideLength -1) );
                        z = (layer - offset) * (scale / Math.max(1, sideLength -1) );
                        if (sideLength === 1) { // Handle single cube case
                            x = y = z = 0;
                        }
                        break;
                }
                cube.position.set(x, y, z);
                cube.userData.initialPosition.copy(cube.position);

                group.add(cube);
                group.userData.subCubes.push(cube);
            }
             // No geometry.dispose() needed for the group itself
        }
        // --- Point Cloud Specific ---
        else if (type === 'pointcloud') {
            const geometry = groupOrGeometry.geometry; // instance is Mesh/Points
            const positions = geometry.attributes.position.array;
            const initialPositions = geometry.userData.initialPositions;
            const particleCount = settings.particleCount;
            const distributionScale = settings.distributionScale;

            // Ensure arrays are the correct size (important if particleCount could change)
            // Note: Currently particleCount change isn't handled well, but this prepares for it.
            if (initialPositions.length !== particleCount * 3) {
                geometry.userData.initialPositions = new Float32Array(particleCount * 3);
                // Position attribute also needs resizing if count changes - complex, deferring full dynamic count change
                console.warn("Particle count change requires geometry recreation - not fully implemented.");
            }

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
        }
        // --- Sphere / Torus / Torus Knot Specific ---
        else if (type === 'sphere' || type === 'torus' || type === 'torusknot') {
            // Recreate the geometry based on current settings
            let newGeometry;
            if (type === 'sphere') {
                newGeometry = new THREE.SphereGeometry(settings.radius, settings.widthSegments, settings.heightSegments);
            } else if (type === 'torus') {
                newGeometry = new THREE.TorusGeometry(settings.radius, settings.tube, settings.radialSegments, settings.tubularSegments);
            } else { // Torus Knot
                newGeometry = new THREE.TorusKnotGeometry(
                    settings.radius,
                    settings.tube,
                    settings.tubularSegments,
                    settings.radialSegments,
                    settings.p,
                    settings.q
                );
            }

            // Dispose old geometry attributes
            geometry.dispose(); // Dispose the old geometry object itself

            // Assign new geometry attributes to the existing instance's geometry object
            // This is generally safer than replacing geometry object entirely if other refs exist
            instance.geometry.attributes = newGeometry.attributes;
            instance.geometry.index = newGeometry.index;
            instance.geometry.boundingBox = newGeometry.boundingBox;
            instance.geometry.boundingSphere = newGeometry.boundingSphere;

            // Update userData with new initial positions and normals
            instance.geometry.userData.initialPositions = new Float32Array(newGeometry.attributes.position.array);
            instance.geometry.userData.initialNormals = new Float32Array(newGeometry.attributes.normal.array);

            // Re-add color attribute if it was removed during geometry update
             if (!instance.geometry.attributes.color) {
                 const numVertices = instance.geometry.attributes.position.count;
                 const colors = new Float32Array(numVertices * 3).fill(1); // Default white
                 instance.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                 console.log("Re-added color attribute after geometry reset.");
             } else {
                 // Ensure color buffer is correct size
                 const numVertices = instance.geometry.attributes.position.count;
                 if (instance.geometry.attributes.color.count !== numVertices) {
                     const colors = new Float32Array(numVertices * 3).fill(1); // Default white
                     instance.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                     console.log("Resized color attribute after geometry reset.");
                 }
             }


            // Mark attributes for update
            instance.geometry.attributes.position.needsUpdate = true;
            instance.geometry.attributes.normal.needsUpdate = true;
            if (instance.geometry.attributes.uv) instance.geometry.attributes.uv.needsUpdate = true;
            if (instance.geometry.attributes.color) instance.geometry.attributes.color.needsUpdate = true;
            if (instance.geometry.index) instance.geometry.index.needsUpdate = true;

            // Compute normals just in case they weren't perfect from constructor
            instance.geometry.computeVertexNormals();
            instance.geometry.computeBoundingSphere(); // Update bounds

            console.log(`Instance ${instance.uuid} geometry recreated.`);
            newGeometry.dispose(); // Dispose the temporary geometry object

        }
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

                // Remove nested folders first (like 'Rotation')
                const nestedFolders = Object.values(guiFolder.__folders);
                nestedFolders.forEach(folder => {
                    // Remove controllers within the nested folder
                    folder.__controllers.forEach(controller => {
                        try { folder.remove(controller); } catch (e) { console.warn("Could not remove nested controller:", controller.property, e); }
                    });
                    // Remove the nested folder itself
                    try { guiFolder.removeFolder(folder); } catch (e) { console.warn("Could not remove nested GUI folder:", e); }
                });


                // Remove top-level controllers
                instanceToDelete.userData.controllers.forEach(controller => {
                    // Only remove if it's directly in this folder (not in a sub-folder)
                    if (controller.parent === guiFolder) {
                        try {
                            guiFolder.remove(controller);
                        } catch (e) {
                            console.warn("Could not remove controller:", controller.property, e);
                        }
                    }
                });

                // Remove the main folder
                try {
                    this.gui.removeFolder(guiFolder);
                } catch (e) {
                    console.warn("Could not remove GUI folder:", e);
                    // Fallback removal if dat.gui internal state is broken
                    if (guiFolder.domElement && guiFolder.domElement.parentNode) {
                         guiFolder.domElement.parentNode.removeChild(guiFolder.domElement);
                    }
                }
            }

            // Remove from scene and dispose
            this.scene.remove(instanceToDelete);

            if (instanceToDelete.userData.settings.type === 'dancingcubes') {
                // Dispose of sub-cube geometries and materials
                instanceToDelete.userData.subCubes.forEach(cube => {
                    if (cube.geometry) cube.geometry.dispose();
                    if (cube.material) {
                        // If materials were cloned per cube, dispose them.
                        // If a shared material was used and modified, more complex logic might be needed.
                        // Based on current `resetObjectInitialGeometry`, materials are cloned.
                        cube.material.dispose();
                    }
                });
                // The main BoxGeometry used for cloning sub-cubes was created in resetObjectInitialGeometry
                // and is not stored directly on the group, so it goes out of scope.
                // The group itself (instanceToDelete) doesn't have a .geometry or .material to dispose.
            } else {
                // Standard disposal for non-group objects
                if (instanceToDelete.geometry) instanceToDelete.geometry.dispose();
                if (instanceToDelete.material) instanceToDelete.material.dispose();
            }

            // Remove from instance array
            this.instances.splice(index, 1);

            // Select the previous instance or null if no instances left
            this.currentInstance = this.instances.length > 0 ? this.instances[Math.max(0, index - 1)] : null;
            if (this.currentInstance && this.transformControls) {
                this.transformControls.attach(this.currentInstance);
                // Open the GUI folder for the newly selected instance
                if (this.currentInstance.userData.guiFolder) {
                    this.currentInstance.userData.guiFolder.open();
                }
            } else if (this.transformControls && !this.currentInstance) {
                 // If no instance is selected, ensure controls are detached
                 this.transformControls.detach();
            }

            console.log(`Instance ${instanceToDelete.uuid} (${instanceToDelete.userData.settings.type}) deleted.`);
        }
    }


    selectInstance(instance) {
        if (this.instances.includes(instance)) {
            // Close previously selected instance's GUI folder
            if (this.currentInstance && this.currentInstance !== instance && this.currentInstance.userData.guiFolder) {
                 this.currentInstance.userData.guiFolder.close();
            }

            this.currentInstance = instance;
            if (this.transformControls) {
                // Attach controls to the new instance
                this.transformControls.attach(instance);
            } else {
                 console.warn("[ObjectManager] Transform controls not available for attachment.");
            }
            // Open the newly selected instance's GUI folder
            if (this.currentInstance.userData.guiFolder) {
                this.currentInstance.userData.guiFolder.open();
            }
            // console.log(`[ObjectManager] Selected instance: ${instance.uuid}`);
        } else {
             console.warn("[ObjectManager] Attempted to select an instance not managed by ObjectManager.");
        }
    }

    // New method to deselect the current instance
    deselectInstance() {
        if (this.currentInstance) {
            // Close the GUI folder
            if (this.currentInstance.userData.guiFolder) {
                this.currentInstance.userData.guiFolder.close();
            }
            // Detach transform controls
            if (this.transformControls) {
                this.transformControls.detach();
            }
            // console.log(`[ObjectManager] Deselected instance: ${this.currentInstance.uuid}`);
            this.currentInstance = null;
        }
    }

    // --- Interaction Logic (moved from main.js) ---

    onPointerDown(event) {
        // Ignore clicks originating from the GUI
        if (event.target.closest('.dg')) return;

        // If TransformControls is hovered, let it handle the event.
        // It will manage disabling OrbitControls via the 'dragging-changed' event.
        if (this.transformControls?.hovered) {
            return;
        }

        // Record the starting position for click detection in onPointerUp
        this.onDownPosition.x = event.clientX;
        this.onDownPosition.y = event.clientY;
    }

    onPointerMove(event) {
        // No selection logic needed on move in this approach.
        // OrbitControls handles camera drag when not dragging the gizmo.
        // TransformControls handles gizmo drag internally.

        // Update pointer coordinates for potential use (e.g., hover effects if added later)
        this.pointer.x = (event.clientX / this.rendererElement.clientWidth) * 2 - 1;
        this.pointer.y = -(event.clientY / this.rendererElement.clientHeight) * 2 + 1;
    }

    onPointerUp(event) {
        // Ignore events originating from the GUI
        if (event.target.closest('.dg')) return;

        // If TransformControls was dragging, it handled the interaction.
        if (this.transformControls?.dragging) {
            // OrbitControls are re-enabled via the 'dragging-changed' listener.
            return;
        }

        // Record the up position and check if it was a click (minimal movement)
        this.onUpPosition.x = event.clientX;
        this.onUpPosition.y = event.clientY;

        if (this.onDownPosition.distanceTo(this.onUpPosition) > 2) { // Click vs drag threshold
            // Considered a drag (likely OrbitControls), not a click for selection.
            return;
        }

        // --- It was a CLICK ---

        // Check if the click was on the gizmo itself (even if not dragging).
        // If hovered at the moment of pointerup, let TransformControls handle it.
        if (this.transformControls?.hovered) {
            return;
        }

        // --- It was a CLICK, and NOT on the gizmo ---
        // Perform selection/deselection raycast.
        this.pointer.x = (event.clientX / this.rendererElement.clientWidth) * 2 - 1;
        this.pointer.y = -(event.clientY / this.rendererElement.clientHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.camera);

        const intersects = this.raycaster.intersectObjects(this.instances, false);

        if (intersects.length > 0) {
            // Clicked on a managed object
            const clickedObject = intersects[0].object;
            if (this.currentInstance !== clickedObject) {
                this.selectInstance(clickedObject);
            }
        } else {
            // Clicked on empty space - Deselect
            this.deselectInstance();
        }
    }


    // --- Setup / Teardown ---

    setupTransformControls(camera, renderer, orbitControls) {
        this.camera = camera; // Store camera reference
        this.rendererElement = renderer.domElement; // Store renderer DOM element
        this.orbitControls = orbitControls; // Store reference
        this.transformControls = new TransformControls(this.camera, this.rendererElement);

        this.transformControls.addEventListener('dragging-changed', event => {
            if (this.orbitControls) {
                this.orbitControls.enabled = !event.value; // Disable orbit controls while dragging
            }
        });

        this.transformControls.addEventListener('objectChange', () => {
            // Update position/rotation in settings when transform controls are used
            if (this.currentInstance) {
                this.currentInstance.userData.settings.position.copy(this.currentInstance.position);
                // Only update settings rotation if NOT auto-rotating, otherwise controls fight auto-rotation
                if (!this.currentInstance.userData.settings.autoRotate) {
                    this.currentInstance.userData.settings.rotation.copy(this.currentInstance.rotation);
                }
            }
        });

        // Add the transform controls OBJECT to the scene.
        this.scene.add(this.transformControls);
        console.log("[ObjectManager] Transform controls object added to scene.");

        // Explicitly add the helper as well (though TransformControls usually manages this)
        this.scene.add(this.transformControls.getHelper());
        console.log("[ObjectManager] Transform controls helper explicitly added to scene.");

        // --- Add event listeners directly to the renderer element ---
        this.boundOnPointerDown = this.onPointerDown.bind(this);
        this.boundOnPointerMove = this.onPointerMove.bind(this);
        this.boundOnPointerUp = this.onPointerUp.bind(this);

        this.rendererElement.addEventListener('pointerdown', this.boundOnPointerDown);
        this.rendererElement.addEventListener('pointermove', this.boundOnPointerMove);
        this.rendererElement.addEventListener('pointerup', this.boundOnPointerUp);
        console.log("[ObjectManager] Interaction listeners added to renderer element.");


        // Select the first instance if available after setup
        if (this.instances.length > 0) {
            this.selectInstance(this.instances[0]);
        } else {
            // Ensure controls are hidden if no initial instance exists
            this.transformControls.detach(); // Detach should hide gizmo
        }
    }

    setTransformMode(mode) {
        if (this.transformControls) {
            this.transformControls.setMode(mode);
        }
    }

    // --- Update Logic ---

    updateObject(instance, audioManager, motionScore, cameraSettings, deltaTime) { // Added deltaTime
        const settings = instance.userData.settings;
        if (!settings.visible) return;

        const type = settings.type;

        // Geometry/Color updates based on audio/motion
        if (type === 'grid') {
            this.updateGridGeometry(instance, audioManager, motionScore, cameraSettings); // Assuming deltaTime not needed here based on its impl.
        } else if (type === 'pointcloud') {
            this.updatePointCloudGeometry(instance, audioManager, motionScore, cameraSettings); // Assuming deltaTime not needed here
        } else if (type === 'sphere') {
            this.updateSphereGeometry(instance, audioManager, motionScore, cameraSettings); // Assuming deltaTime not needed here
        } else if (type === 'torus') {
            this.updateTorusGeometry(instance, audioManager, motionScore, cameraSettings); // Assuming deltaTime not needed here
        } else if (type === 'torusknot') {
            this.updateTorusKnotGeometry(instance, audioManager, motionScore, cameraSettings); // Assuming deltaTime not needed here
        } else if (type === 'dancingcubes') {
            this.updateDancingCubesGeometry(instance, audioManager, motionScore, cameraSettings, deltaTime); // Pass deltaTime
        }
    }

    // --- Geometry Update Functions ---

    updateDancingCubesGeometry(groupInstance, audioManager, motionScore, cameraSettings, deltaTime) { // Added deltaTime
        const settings = groupInstance.userData.settings;
        const subCubes = groupInstance.userData.subCubes;
        if (!subCubes || subCubes.length === 0) return;

        const averageAmplitude = audioManager.getAverageAmplitude(settings.frequencyRange);
        const normalizedAvgAmp = averageAmplitude / 255;

        // Effective influence incorporating motion
        let effectiveAudioInfluence = settings.audioInfluence;
        if (cameraSettings.cameraMotionEnabled && audioManager.audioContext && settings.motionInfluenceFactor > 0) {
            const influence = motionScore * settings.motionInfluenceFactor;
            effectiveAudioInfluence *= (1 + influence);
        }

        const time = performance.now() * 0.001;

        // Frequency band data for color or specific effects
        let lowAmpNorm = 0, midAmpNorm = 0, highAmpNorm = 0;
        const useFreqBands = settings.colorMapping === 'frequencyBands' || settings.effectMode === 'combination'; // Example usage
        if (useFreqBands && audioManager.audioContext) {
            lowAmpNorm = audioManager.getAverageAmplitude('low') / 255;
            midAmpNorm = audioManager.getAverageAmplitude('mid') / 255;
            highAmpNorm = audioManager.getAverageAmplitude('high') / 255;
        }
        const tempColor = new THREE.Color();

        subCubes.forEach((cube, index) => {
            const initialPos = cube.userData.initialPosition;
            // const initialRot = cube.userData.initialRotation;
            // const initialScale = cube.userData.initialScale;

            let audioFactor = normalizedAvgAmp; // Default audio factor
            // Could vary audioFactor per cube based on index or position for more complex patterns
            // e.g. audioFactor = (audioManager.getFrequencyData()[index % audioManager.getFrequencyData().length] || 0) / 255;

            // --- Effects ---
            const effectStrength = audioFactor * effectiveAudioInfluence;

            if (settings.effectMode === 'scale' || settings.effectMode === 'combination') {
                const scaleFactor = 1 + effectStrength * 1.5; // Scale up to 2.5x
                cube.scale.set(scaleFactor, scaleFactor, scaleFactor);
            } else {
                cube.scale.copy(cube.userData.initialScale); // Reset if not scaling
            }

            if (settings.effectMode === 'rotate' || settings.effectMode === 'combination') {
                const rotationSpeed = effectStrength * 2; // Radians per second based on audio
                cube.rotation.x += rotationSpeed * deltaTime * (index % 3 === 0 ? 1 : 0.5);
                cube.rotation.y += rotationSpeed * deltaTime * (index % 3 === 1 ? 1 : 0.5);
                cube.rotation.z += rotationSpeed * deltaTime * (index % 3 === 2 ? 1 : 0.5);
            } else {
                 cube.rotation.set(0,0,0); // Or reset to initialRotation if stored and preferred
            }

            if (settings.effectMode === 'position' || settings.effectMode === 'combination') {
                const posOffsetStrength = effectStrength * settings.overallScale * 0.2;
                cube.position.x = initialPos.x + (Math.sin(time + index * 0.5) * posOffsetStrength);
                cube.position.y = initialPos.y + (Math.cos(time + index * 0.3) * posOffsetStrength);
                // cube.position.z = initialPos.z + (Math.sin(time + index * 0.7) * posOffsetStrength);
            } else if (settings.effectMode !== 'scale' && settings.effectMode !== 'rotate') { // Avoid resetting if scale/rotate also active
                cube.position.copy(initialPos);
            }


            // --- Color ---
            let finalColor = settings.midColor; // Default
            switch (settings.colorMapping) {
                case 'audio':
                    if (normalizedAvgAmp < 0.5) {
                        tempColor.lerpColors(settings.lowColor, settings.midColor, normalizedAvgAmp * 2);
                    } else {
                        tempColor.lerpColors(settings.midColor, settings.highColor, (normalizedAvgAmp - 0.5) * 2);
                    }
                    finalColor = tempColor;
                    break;
                case 'frequencyBands':
                    tempColor.setRGB(0,0,0);
                    tempColor.lerp(settings.lowColor, lowAmpNorm);
                    tempColor.lerp(settings.midColor, midAmpNorm);
                    tempColor.lerp(settings.highColor, highAmpNorm);
                    finalColor = tempColor;
                    break;
                case 'individual':
                    // Example: color based on index - could be anything
                    const hue = (index / subCubes.length) % 1.0;
                    finalColor = tempColor.setHSL(hue, 0.8, 0.6);
                    break;
            }
            cube.material.color.copy(finalColor);
            if (cube.material.emissive) { // Check if material has emissive property
                 cube.material.emissive.copy(finalColor).multiplyScalar(0.3);
            }
        });
    }

    updateGridGeometry(grid, audioManager, motionScore, cameraSettings) {
        const settings = grid.userData.settings;
        const frequencyData = audioManager.getFrequencyRangeData(settings.frequencyRange);
        const vertices = grid.geometry.attributes.position.array;
        const colors = grid.geometry.attributes.color.array;
        const originalZ = grid.geometry.userData.originalZ; // Get original Z for reference

        const size = grid.geometry.parameters.width; // Use actual geometry params
        const segments = grid.geometry.parameters.widthSegments;
        const verticesPerSide = segments + 1;
        const halfSize = size / 2;
        const maxDistance = Math.sqrt(halfSize * halfSize + halfSize * halfSize); // For radial/ripple
        const verticesCount = vertices.length / 3;

        // Calculate effective parameters based on motion
        let effectiveHeightScale = settings.heightScale;
        if (cameraSettings.cameraMotionEnabled && audioManager.audioContext && settings.motionInfluenceFactor > 0) {
            const influence = motionScore * settings.motionInfluenceFactor;
            effectiveHeightScale = settings.heightScale * (1 + influence);
        }

        // Get frequency band data if needed
        let lowAmp = 0, midAmp = 0, highAmp = 0;
        const useFreqBands = settings.colorMapping === 'frequencyBands' || settings.wavePattern === 'checkerboard';
        if (useFreqBands && audioManager.audioContext) {
            lowAmp = audioManager.getAverageAmplitude('low');
            midAmp = audioManager.getAverageAmplitude('mid');
            highAmp = audioManager.getAverageAmplitude('high');
        }
        const avgAmp = audioManager.getAverageAmplitude(settings.frequencyRange); // For ripple

        const time = performance.now() * 0.002;
        const tempColor = new THREE.Color(); // Reuse color object

        for (let i = 0; i < verticesCount; i++) {
            const x = vertices[i * 3];
            const y = vertices[i * 3 + 1]; // Local Y (world Z for default grid orientation)
            const zIndex = i * 3 + 2; // Index for Z component (local Z, world Y)

            let audioValue = 0;
            let patternHeight = 0;
            const distance = Math.sqrt(x * x + y * y); // Distance from center (0,0)

            if (frequencyData.length > 0 && audioManager.audioContext) {
                switch (settings.wavePattern) {
                    case 'radial':
                        const normalizedDistance = Math.min(distance / maxDistance, 1.0);
                        const index = Math.floor(normalizedDistance * (frequencyData.length - 1));
                        audioValue = frequencyData[index] || 0;
                        break;
                    case 'linear':
                        const linearIndex = i % frequencyData.length;
                        audioValue = frequencyData[linearIndex] || 0;
                        break;
                    case 'random':
                        audioValue = frequencyData[Math.floor(Math.random() * frequencyData.length)] || 0;
                        break;
                    case 'sineWave':
                        const avgMidAmpNorm = midAmp / 255;
                        patternHeight = Math.sin(distance * (1 + avgMidAmpNorm * 2) - time * (1 + avgMidAmpNorm * 5)) * (0.5 + avgMidAmpNorm);
                        audioValue = avgAmp; // Use average amplitude for overall height
                        break;
                    case 'checkerboard':
                        const scale = 4.0;
                        const checkX = Math.floor((x + halfSize) / scale);
                        const checkY = Math.floor((y + halfSize) / scale);
                        audioValue = ((checkX + checkY) % 2 === 0) ? lowAmp : highAmp;
                        break;
                    case 'ripple':
                        const rippleSpeed = 3.0;
                        const rippleFreq = 5.0;
                        const rippleDecay = 2.0;
                        const normalizedAvgAmp = avgAmp / 255;
                        // Calculate ripple based on distance from center and time, modulated by audio
                        patternHeight = Math.sin(distance * rippleFreq - time * rippleSpeed * (1 + normalizedAvgAmp))
                                      * Math.max(0, 1 - (distance / (maxDistance * (0.5 + normalizedAvgAmp*0.5)))) // Decay outwards
                                      * normalizedAvgAmp * 1.5; // Scale by audio amplitude
                        audioValue = avgAmp; // Base height on average amplitude
                        break;
                    default:
                         const defaultIndex = i % frequencyData.length;
                         audioValue = frequencyData[defaultIndex] || 0;
                }
            }

            const audioHeight = (audioValue / 255) * effectiveHeightScale * settings.audioInfluence;
            const totalPatternHeight = audioHeight + (patternHeight * effectiveHeightScale * settings.audioInfluence);

            // Set Z position relative to original Z (which is 0 for PlaneGeometry)
            vertices[zIndex] = originalZ[i] + totalPatternHeight;

            // --- Color Calculation ---
            let colorFactor = 0;
            const normalizedHeight = totalPatternHeight / effectiveHeightScale; // Normalize based on effective scale
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
        const particleCount = settings.particleCount; // Use count from settings

        // Ensure buffers match particle count (basic check)
        if (positions.length !== particleCount * 3 || initialPositions.length !== particleCount * 3 || colors.length !== particleCount * 3) {
             console.warn(`Point cloud buffer size mismatch (Settings: ${particleCount}, Buffers: ${positions.length/3}). Skipping update.`);
             // Ideally, trigger geometry recreation here if count changed.
             return;
        }

        const averageAmplitude = audioManager.getAverageAmplitude(settings.frequencyRange); // Normalized 0-255

        // Calculate effective parameters based on motion
        let effectiveDisplacementScale = settings.displacementScale;
        if (cameraSettings.cameraMotionEnabled && audioManager.audioContext && settings.motionInfluenceFactor > 0) {
            const influence = motionScore * settings.motionInfluenceFactor;
            effectiveDisplacementScale = settings.displacementScale * (1 + influence);
        }

        // Get frequency band data if needed
        let lowAmpNorm = 0, midAmpNorm = 0, highAmpNorm = 0;
        const useFreqBands = settings.colorMapping === 'frequencyBands' || settings.displacementMode === 'frequencyBandDisplacement';
        if (useFreqBands && audioManager.audioContext) {
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
            directionVector.set(initialX, initialY, initialZ).normalize(); // Direction from origin

            if (audioManager.audioContext) {
                switch(settings.displacementMode) {
                    case 'frequencyBandDisplacement':
                        // Displace based on which frequency band is strongest, or a mix
                        // Simple approach: displace by sum of scaled band amplitudes
                        displacement = (lowAmpNorm + midAmpNorm + highAmpNorm) / 3 * effectiveDisplacementScale * settings.audioInfluence;
                        // More complex: displace differently based on initial position?
                        // Or displace along different axes based on freq? e.g., low=X, mid=Y, high=Z
                        // Let's try displacing along initial direction but scaled by different freqs
                        const freqDisplacement = (lowAmpNorm * 0.5 + midAmpNorm * 1.0 + highAmpNorm * 1.5) / 3.0; // Weight highs more
                        displacement = freqDisplacement * effectiveDisplacementScale * settings.audioInfluence;
                        break;
                    case 'radial':
                    default:
                         // Use average amplitude for overall displacement magnitude
                         const normalizedAvgAmp = averageAmplitude / 255;
                         displacement = normalizedAvgAmp * effectiveDisplacementScale * settings.audioInfluence;
                         break;
                }
            }


            // Apply displacement along the direction vector
            positions[i3] = initialX + directionVector.x * displacement;
            positions[i3 + 1] = initialY + directionVector.y * displacement;
            positions[i3 + 2] = initialZ + directionVector.z * displacement;


            // --- Color Calculation ---
            let colorFactor = 0;
            const normalizedAudio = averageAmplitude / 255; // Use average amplitude for 'audio' color

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

    updateSphereGeometry(sphere, audioManager, motionScore, cameraSettings) {
        const settings = sphere.userData.settings;
        const geometry = sphere.geometry;
        const positions = geometry.attributes.position.array;
        const colors = geometry.attributes.color.array;
        const initialPositions = geometry.userData.initialPositions;
        const initialNormals = geometry.userData.initialNormals;
        const numVertices = positions.length / 3;

        // Ensure buffers match vertex count (basic check)
        if (initialPositions.length !== numVertices * 3 || initialNormals.length !== numVertices * 3 || colors.length !== numVertices * 3) {
             console.warn(`Sphere buffer size mismatch. Skipping update.`);
             return;
        }

        const averageAmplitude = audioManager.getAverageAmplitude(settings.frequencyRange); // Normalized 0-255

        // Calculate effective parameters based on motion
        let effectiveDisplacementScale = settings.displacementScale;
        if (cameraSettings.cameraMotionEnabled && audioManager.audioContext && settings.motionInfluenceFactor > 0) {
            const influence = motionScore * settings.motionInfluenceFactor;
            effectiveDisplacementScale = settings.displacementScale * (1 + influence);
        }

        // Get frequency band data if needed
        let lowAmpNorm = 0, midAmpNorm = 0, highAmpNorm = 0;
        const useFreqBands = settings.colorMapping === 'frequencyBands';
        if (useFreqBands && audioManager.audioContext) {
            lowAmpNorm = audioManager.getAverageAmplitude('low') / 255;
            midAmpNorm = audioManager.getAverageAmplitude('mid') / 255;
            highAmpNorm = audioManager.getAverageAmplitude('high') / 255;
        }

        const tempColor = new THREE.Color(); // Reuse color object
        const tempNormal = new THREE.Vector3(); // Reuse vector

        for (let i = 0; i < numVertices; i++) {
            const i3 = i * 3;

            // --- Position Calculation ---
            const initialX = initialPositions[i3];
            const initialY = initialPositions[i3 + 1];
            const initialZ = initialPositions[i3 + 2];

            // Get the initial normal for this vertex
            tempNormal.set(initialNormals[i3], initialNormals[i3 + 1], initialNormals[i3 + 2]);

            let displacement = 0;
            if (audioManager.audioContext) {
                const normalizedAvgAmp = averageAmplitude / 255;
                displacement = normalizedAvgAmp * effectiveDisplacementScale * settings.audioInfluence;
            }

            // Apply displacement along the initial normal
            positions[i3] = initialX + tempNormal.x * displacement;
            positions[i3 + 1] = initialY + tempNormal.y * displacement;
            positions[i3 + 2] = initialZ + tempNormal.z * displacement;

            // --- Color Calculation ---
            let colorFactor = 0;
            const normalizedAudio = averageAmplitude / 255;

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
                case 'normal':
                     // Color based on normal direction (e.g., map X,Y,Z to R,G,B)
                     // Use the *initial* normal for consistent coloring
                     colorFactor = (tempNormal.x + 1) / 2; // Map X from [-1, 1] to [0, 1] for Red
                     const gFactor = (tempNormal.y + 1) / 2; // Map Y for Green
                     const bFactor = (tempNormal.z + 1) / 2; // Map Z for Blue
                     tempColor.setRGB(colorFactor, gFactor, bFactor);
                     break;
            }

            if (settings.colorMapping === 'audio') { // Only apply lerp for 'audio' mode
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
        geometry.computeVertexNormals(); // Recompute normals after displacement
    }

    updateTorusGeometry(torus, audioManager, motionScore, cameraSettings) {
        const settings = torus.userData.settings;
        const geometry = torus.geometry;
        const positions = geometry.attributes.position.array;
        const colors = geometry.attributes.color.array;
        const initialPositions = geometry.userData.initialPositions;
        const initialNormals = geometry.userData.initialNormals;
        const numVertices = positions.length / 3;

         // Ensure buffers match vertex count (basic check)
         if (initialPositions.length !== numVertices * 3 || initialNormals.length !== numVertices * 3 || colors.length !== numVertices * 3) {
             console.warn(`Torus buffer size mismatch. Skipping update.`);
             return;
         }

        const averageAmplitude = audioManager.getAverageAmplitude(settings.frequencyRange); // Normalized 0-255

        // Calculate effective parameters based on motion
        let effectiveDisplacementScale = settings.displacementScale;
        if (cameraSettings.cameraMotionEnabled && audioManager.audioContext && settings.motionInfluenceFactor > 0) {
            const influence = motionScore * settings.motionInfluenceFactor;
            effectiveDisplacementScale = settings.displacementScale * (1 + influence);
        }

        // Get frequency band data if needed
        let lowAmpNorm = 0, midAmpNorm = 0, highAmpNorm = 0;
        const useFreqBands = settings.colorMapping === 'frequencyBands';
        if (useFreqBands && audioManager.audioContext) {
            lowAmpNorm = audioManager.getAverageAmplitude('low') / 255;
            midAmpNorm = audioManager.getAverageAmplitude('mid') / 255;
            highAmpNorm = audioManager.getAverageAmplitude('high') / 255;
        }

        const tempColor = new THREE.Color(); // Reuse color object
        const tempNormal = new THREE.Vector3(); // Reuse vector

        for (let i = 0; i < numVertices; i++) {
            const i3 = i * 3;

            // --- Position Calculation ---
            const initialX = initialPositions[i3];
            const initialY = initialPositions[i3 + 1];
            const initialZ = initialPositions[i3 + 2];

            // Get the initial normal for this vertex
            tempNormal.set(initialNormals[i3], initialNormals[i3 + 1], initialNormals[i3 + 2]);

            let displacement = 0;
            if (audioManager.audioContext) {
                const normalizedAvgAmp = averageAmplitude / 255;
                displacement = normalizedAvgAmp * effectiveDisplacementScale * settings.audioInfluence;
            }

            // Apply displacement along the initial normal
            positions[i3] = initialX + tempNormal.x * displacement;
            positions[i3 + 1] = initialY + tempNormal.y * displacement;
            positions[i3 + 2] = initialZ + tempNormal.z * displacement;

            // --- Color Calculation ---
            let colorFactor = 0;
            const normalizedAudio = averageAmplitude / 255;

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
                case 'normal':
                     // Color based on normal direction (e.g., map X,Y,Z to R,G,B)
                     colorFactor = (tempNormal.x + 1) / 2; // Map X from [-1, 1] to [0, 1] for Red
                     const gFactor = (tempNormal.y + 1) / 2; // Map Y for Green
                     const bFactor = (tempNormal.z + 1) / 2; // Map Z for Blue
                     tempColor.setRGB(colorFactor, gFactor, bFactor);
                     break;
            }

            if (settings.colorMapping === 'audio') { // Only apply lerp for 'audio' mode
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
        geometry.computeVertexNormals(); // Recompute normals after displacement
    }

    updateTorusKnotGeometry(torusknot, audioManager, motionScore, cameraSettings) {
        const settings = torusknot.userData.settings;
        const geometry = torusknot.geometry;
        const positions = geometry.attributes.position.array;
        const colors = geometry.attributes.color.array;
        const initialPositions = geometry.userData.initialPositions;
        const initialNormals = geometry.userData.initialNormals;
        const numVertices = positions.length / 3;

         // Ensure buffers match vertex count (basic check)
         if (initialPositions.length !== numVertices * 3 || initialNormals.length !== numVertices * 3 || colors.length !== numVertices * 3) {
             console.warn(`Torus Knot buffer size mismatch. Skipping update.`);
             return;
         }

        const averageAmplitude = audioManager.getAverageAmplitude(settings.frequencyRange); // Normalized 0-255

        // Calculate effective parameters based on motion
        let effectiveDisplacementScale = settings.displacementScale;
        if (cameraSettings.cameraMotionEnabled && audioManager.audioContext && settings.motionInfluenceFactor > 0) {
            const influence = motionScore * settings.motionInfluenceFactor;
            effectiveDisplacementScale = settings.displacementScale * (1 + influence);
        }

        // Get frequency band data if needed
        let lowAmpNorm = 0, midAmpNorm = 0, highAmpNorm = 0;
        const useFreqBands = settings.colorMapping === 'frequencyBands';
        if (useFreqBands && audioManager.audioContext) {
            lowAmpNorm = audioManager.getAverageAmplitude('low') / 255;
            midAmpNorm = audioManager.getAverageAmplitude('mid') / 255;
            highAmpNorm = audioManager.getAverageAmplitude('high') / 255;
        }

        const tempColor = new THREE.Color(); // Reuse color object
        const tempNormal = new THREE.Vector3(); // Reuse vector

        for (let i = 0; i < numVertices; i++) {
            const i3 = i * 3;

            // --- Position Calculation ---
            const initialX = initialPositions[i3];
            const initialY = initialPositions[i3 + 1];
            const initialZ = initialPositions[i3 + 2];

            // Get the initial normal for this vertex
            tempNormal.set(initialNormals[i3], initialNormals[i3 + 1], initialNormals[i3 + 2]);

            let displacement = 0;
            if (audioManager.audioContext) {
                const normalizedAvgAmp = averageAmplitude / 255;
                displacement = normalizedAvgAmp * effectiveDisplacementScale * settings.audioInfluence;
            }

            // Apply displacement along the initial normal
            positions[i3] = initialX + tempNormal.x * displacement;
            positions[i3 + 1] = initialY + tempNormal.y * displacement;
            positions[i3 + 2] = initialZ + tempNormal.z * displacement;

            // --- Color Calculation ---
            let colorFactor = 0;
            const normalizedAudio = averageAmplitude / 255;

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
                case 'normal':
                     // Color based on normal direction (e.g., map X,Y,Z to R,G,B)
                     colorFactor = (tempNormal.x + 1) / 2; // Map X from [-1, 1] to [0, 1] for Red
                     const gFactor = (tempNormal.y + 1) / 2; // Map Y for Green
                     const bFactor = (tempNormal.z + 1) / 2; // Map Z for Blue
                     tempColor.setRGB(colorFactor, gFactor, bFactor);
                     break;
            }

            if (settings.colorMapping === 'audio') { // Only apply lerp for 'audio' mode
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
        geometry.computeVertexNormals(); // Recompute normals after displacement
    }


    // --- Cleanup ---

    dispose() {
        console.log("Disposing ObjectManager...");

        // Remove event listeners added in setupTransformControls
        if (this.rendererElement) {
            this.rendererElement.removeEventListener('pointerdown', this.boundOnPointerDown);
            this.rendererElement.removeEventListener('pointermove', this.boundOnPointerMove);
            this.rendererElement.removeEventListener('pointerup', this.boundOnPointerUp);
            console.log("[ObjectManager] Interaction listeners removed from renderer element.");
        }
        this.boundOnPointerDown = null;
        this.boundOnPointerMove = null;
        this.boundOnPointerUp = null;
        this.rendererElement = null;
        this.camera = null;


        if (this.transformControls) {
            // Detach from any object first
            this.transformControls.detach();

            const helper = this.transformControls.getHelper();
            if (helper && helper.parent) {
                this.scene.remove(helper);
                console.log("[ObjectManager] Transform controls helper removed from scene.");
            }

            // Remove the main control object from the scene
            if (this.transformControls.parent) { // Check if main control object is in scene
                this.scene.remove(this.transformControls);
                console.log("[ObjectManager] Transform controls object removed from scene.");
            }
            // Dispose of the controls
            this.transformControls.dispose();
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
