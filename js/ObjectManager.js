import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import * as dat from 'https://cdn.skypack.dev/dat.gui';


// --- Toon Shader Definition ---
const ToonShader = {
    uniforms: {
        // Uniforms from MeshPhongMaterial that might be useful + custom ones
        'diffuse': { value: new THREE.Color(0xffffff) }, // Base color of the object
        'map': { value: null }, // Texture map
        'toonLevels': { value: 3 }, // Number of distinct shades

        // Lighting uniforms will be automatically provided by Three.js when 'lights: true'
        // 'ambientLightColor': { value: new THREE.Color(0x404040) }, // Provided by Three.js as ambientLightColor
        // For directional lights, Three.js provides an array:
        // uniform DirectionalLight directionalLights[NUM_DIR_LIGHTS];
        // struct DirectionalLight {
        //     vec3 direction;
        //     vec3 color;
        // };
        // We'll assume the first directional light is the primary one for toon shading.

        // Outline (Basic - not fully implemented in this shader, more for parameter storage)
        // 'outlineColor': { value: new THREE.Color(0x000000) },
        // 'outlineWidth': { value: 0.02 },
    },
    vertexShader: `
        varying vec3 vNormal;
        varying vec2 vUv;
        varying vec3 vViewPosition; // Corrected: position of the vertex in view space

        void main() {
            vUv = uv;
            vNormal = normalize(normalMatrix * normal);
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vViewPosition = -mvPosition.xyz; // Position of vertex in view coords
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: `
        uniform vec3 diffuse;
        uniform sampler2D map;
        uniform bool useMap; // Boolean to control texture usage, set based on settings.diffuseMap
        uniform float toonLevels;

        // Access Three.js built-in lighting uniforms
        // uniform vec3 ambientLightColor; // Already available globally from Three.js if lights = true

        // Directional light struct (provided by Three.js when lights: true)
        struct DirectionalLight {
            vec3 direction; // Already in view space
            vec3 color;
        };
        uniform DirectionalLight directionalLights[NUM_DIR_LIGHTS]; // NUM_DIR_LIGHTS is defined by Three.js

        varying vec3 vNormal;
        varying vec2 vUv;
        varying vec3 vViewPosition; // Position of fragment in view space

        void main() {
            // Base color from texture or uniform
            vec4 baseColor = vec4(diffuse, 1.0);
            if (useMap) {
                 baseColor *= texture2D(map, vUv);
            }

            // Lighting
            vec3 normal = normalize(vNormal);
            float lightIntensity = 0.0;
            vec3 directionalLightColor = vec3(0.0);

            // Assume the first directional light is the primary one for toon shading.
            // In a more complex setup, you might iterate or select lights.
            if (NUM_DIR_LIGHTS > 0) {
                // Directional light direction from Three.js is already in view space and pointing FROM the light source
                vec3 lightDir = normalize(directionalLights[0].direction);
                lightIntensity = max(dot(normal, lightDir), 0.0);
                directionalLightColor = directionalLights[0].color;
            }

            // Quantize light intensity for toon effect
            float quantizedIntensity = floor(lightIntensity * toonLevels) / toonLevels;

            // Combine with light color and add ambient (Three.js provides ambientLightColor globally)
            vec3 totalLight = ambientLightColor + (directionalLightColor * quantizedIntensity);
            vec3 outgoingLight = baseColor.rgb * totalLight;

            gl_FragColor = vec4(outgoingLight, baseColor.a);
        }
    `
};


// Default settings structure
const defaultSettings = {
    grid: {
        type: 'grid',
        materialType: 'MeshPhongMaterial', // Added
        diffuseMap: null, // Added
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
        autoRotate: false,
        rotationSpeed: new THREE.Vector3(0, 0, 0)
        // Note: Grid size/segments are constructor params, not instance settings
    },
    pointcloud: {
        type: 'pointcloud',
        // materialType and diffuseMap are not applicable to PointsMaterial in the same way
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
        materialType: 'MeshPhongMaterial',
        diffuseMap: null,
        toonLevels: 3, // Added for ToonMaterial
        toonOutlineColor: new THREE.Color(0x000000), // Added for ToonMaterial
        toonOutlineWidth: 0.02, // Added for ToonMaterial
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
        autoRotate: false,
        rotationSpeed: new THREE.Vector3(0, 0, 0)
    },
    torus: {
        type: 'torus',
        materialType: 'MeshPhongMaterial',
        diffuseMap: null,
        toonLevels: 3,
        toonOutlineColor: new THREE.Color(0x000000),
        toonOutlineWidth: 0.02,
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
        autoRotate: false,
        rotationSpeed: new THREE.Vector3(0, 0, 0)
    },
    torusknot: {
        type: 'torusknot',
        materialType: 'MeshPhongMaterial',
        diffuseMap: null,
        toonLevels: 3,
        toonOutlineColor: new THREE.Color(0x000000),
        toonOutlineWidth: 0.02,
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
            torusknot: this.createTorusKnotTemplate()
        };
        this.instanceCount = 0;

        // For interaction logic within ObjectManager
        this.camera = null; // Will be set in setupTransformControls
        this.rendererElement = null; // Will be set in setupTransformControls
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.onDownPosition = new THREE.Vector2();
        this.onUpPosition = new THREE.Vector2();

        this.textureLoader = new THREE.TextureLoader(); // Added for texture loading

        // Store bound event listeners for removal
        this.boundOnPointerDown = null;
        this.boundOnPointerMove = null;
        this.boundOnPointerUp = null;
    }

    _deepCloneSettings(sourceSettings, type) {
        // Start with a JSON-based deep clone for most properties
        const newSettings = JSON.parse(JSON.stringify(sourceSettings));

        // Restore THREE.js specific objects
        // Ensure these properties exist in sourceSettings before copying
        if (sourceSettings.lowColor) {
            newSettings.lowColor = new THREE.Color().copy(sourceSettings.lowColor);
        }
        if (sourceSettings.midColor) {
            newSettings.midColor = new THREE.Color().copy(sourceSettings.midColor);
        }
        if (sourceSettings.highColor) {
            newSettings.highColor = new THREE.Color().copy(sourceSettings.highColor);
        }
        // Toon material specific settings
        if (sourceSettings.toonOutlineColor) {
            newSettings.toonOutlineColor = new THREE.Color().copy(sourceSettings.toonOutlineColor);
        } else if (defaultSettings[type] && defaultSettings[type].toonOutlineColor) { // Ensure default exists
            newSettings.toonOutlineColor = new THREE.Color().copy(defaultSettings[type].toonOutlineColor);
        }


        // For new instances, position and rotation are reset.
        // If we were cloning an *existing* instance and wanted to preserve its transform,
        // we'd copy sourceSettings.position and sourceSettings.rotation here.
        // However, addInstance logic re-initializes these based on the object's actual transform later.
        newSettings.position = new THREE.Vector3(); // Reset for new instance logic in addInstance
        newSettings.rotation = new THREE.Euler();   // Reset for new instance logic in addInstance

        if (sourceSettings.rotationSpeed) {
            newSettings.rotationSpeed = new THREE.Vector3().copy(sourceSettings.rotationSpeed);
        } else {
            newSettings.rotationSpeed = new THREE.Vector3(); // Default if not present
        }

        newSettings.type = type; // Ensure type is correctly set

        // For properties that are objects themselves (like rotationSpeed),
        // JSON.parse(JSON.stringify(sourceSettings.rotationSpeed)) would also work for plain objects.
        // But explicit THREE.Vector3().copy() is safer and clearer for THREE types.

        return newSettings;
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
        if (geometry.attributes.normal && type !== 'pointcloud') { // Point clouds don't have normals
             geometry.attributes.normal = geometry.attributes.normal.clone();
             geometry.attributes.normal.array = new Float32Array(geometry.attributes.normal.array);
        }

        // Clone userData deeply for arrays
        geometry.userData = {};
        for (const key in template.geometry.userData) {
            if (template.geometry.userData[key] instanceof Float32Array) {
                geometry.userData[key] = new Float32Array(template.geometry.userData[key]);
            } else {
                geometry.userData[key] = JSON.parse(JSON.stringify(template.geometry.userData[key]));
            }
        }


        let instanceObject;
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


        const sourceSettings = baseInstance ? baseInstance.userData.settings : template.defaultSettings;

        // Deep clone settings using the new helper function
        const newSettings = this._deepCloneSettings(sourceSettings, type);

        // Material setup based on settings
        if (newSettings.materialType === 'MeshStandardMaterial' && type !== 'pointcloud') {
            const standardMaterial = new THREE.MeshStandardMaterial({
                vertexColors: material.vertexColors, // Preserve vertex colors
                wireframe: newSettings.wireframe,
                side: material.side,
                // metalness: 0.5, // Default metalness
                // roughness: 0.5, // Default roughness
            });
            material.dispose(); // Dispose the original cloned template material
            instanceObject.material = standardMaterial;
        } else if (type !== 'pointcloud') { // MeshPhongMaterial or others
            // The original 'material' is already assigned to instanceObject.material
            instanceObject.material.wireframe = newSettings.wireframe;
        } else { // PointCloud
            instanceObject.material.size = newSettings.particleSize;
        }

        // Initial diffuse map loading
        if (newSettings.diffuseMap && type !== 'pointcloud') {
            this.textureLoader.load(
                newSettings.diffuseMap,
                (texture) => { // onLoad
                    instanceObject.material.map = texture;
                    instanceObject.material.needsUpdate = true;
                },
                undefined, // onProgress (optional)
                (error) => { // onError
                    console.error(`Failed to load texture: ${newSettings.diffuseMap}`, error);
                    // Optionally clear the setting if loading fails to prevent re-attempts
                    // newSettings.diffuseMap = null;
                }
            );
        }


        instanceObject.userData = {
            settings: newSettings,
            guiFolder: null,
            controllers: [] // To keep track of GUI controllers for removal
        };

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

        // If it's a point cloud, sphere, torus, or torus knot, ensure its initial geometry matches its settings
        if (type === 'pointcloud' || type === 'sphere' || type === 'torus' || type === 'torusknot') {
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
        const controllers = []; // Local array to gather all controllers

        // Create common controls shared by all object types
        this._createCommonGuiControls(instanceObject, guiFolder, settings, controllers);

        // Create type-specific controls
        switch (type) {
            case 'grid':
                this._createGridGuiControls(instanceObject, guiFolder, settings, controllers);
                break;
            case 'pointcloud':
                this._createPointCloudGuiControls(instanceObject, guiFolder, settings, controllers);
                break;
            case 'sphere':
                this._createSphereGuiControls(instanceObject, guiFolder, settings, controllers);
                break;
            case 'torus':
                this._createTorusGuiControls(instanceObject, guiFolder, settings, controllers);
                break;
            case 'torusknot':
                this._createTorusKnotGuiControls(instanceObject, guiFolder, settings, controllers);
                break;
            default:
                console.warn(`No specific GUI controls defined for type: ${type}`);
        }

        instanceObject.userData.controllers = controllers; // Store all collected controllers
    }


    // --- GUI Control Creation Helpers ---
    _createCommonGuiControls(instanceObject, guiFolder, settings, controllers) {
        // Basic Visibility and Audio Interaction
        controllers.push(
            guiFolder.add(settings, 'visible').name("Visible").onChange(val => instanceObject.visible = val),
            guiFolder.add(settings, 'audioInfluence', 0, 2).name("Audio Influence").step(0.1),
            guiFolder.add(settings, 'frequencyRange', ['low', 'mid', 'high']).name("Audio Freq Range"),
            guiFolder.add(settings, 'motionInfluenceFactor', 0, 1).name("Motion Influence").step(0.05)
        );

        // Material Controls
        if (['grid', 'sphere', 'torus', 'torusknot'].includes(settings.type)) {
            const materialFolder = guiFolder.addFolder('Material');
            controllers.push(
                materialFolder.add(settings, 'materialType', ['MeshPhongMaterial', 'MeshStandardMaterial', 'ToonMaterial'])
                    .name('Material Type')
                    .onChange(newType => this._updateInstanceMaterial(instanceObject, newType))
            );
            controllers.push(
                materialFolder.add(settings, 'wireframe').name("Wireframe").onChange(val => {
                    if (instanceObject.material.wireframe !== undefined) { // Standard materials
                        instanceObject.material.wireframe = val;
                    } else if (instanceObject.material.uniforms && instanceObject.material.uniforms.wireframe) { // ShaderMaterial
                        instanceObject.material.uniforms.wireframe.value = val;
                    }
                })
            );
            controllers.push(
                materialFolder.add(settings, 'diffuseMap')
                    .name('Diffuse Map URL')
                    .onChange(path => this._loadTextureToMaterial(instanceObject, 'map', path))
            );

            // Toon Material Specific Controls (conditionally displayed)
            const toonControls = [];
            toonControls.push(materialFolder.add(settings, 'toonLevels', 1, 10).step(1).name('Toon Levels')
                .onChange(val => { if (settings.materialType === 'ToonMaterial' && instanceObject.material.uniforms) instanceObject.material.uniforms.toonLevels.value = val; }));
            // toonControls.push(materialFolder.addColor(settings, 'toonOutlineColor').name('Outline Color')
            //     .onChange(val => { if (settings.materialType === 'ToonMaterial' && instanceObject.material.uniforms) instanceObject.material.uniforms.outlineColor.value.set(val); }));
            // toonControls.push(materialFolder.add(settings, 'toonOutlineWidth', 0.0, 0.1).step(0.001).name('Outline Width')
            //     .onChange(val => { if (settings.materialType === 'ToonMaterial' && instanceObject.material.uniforms) instanceObject.material.uniforms.outlineWidth.value = val; }));

            instanceObject.userData.toonMaterialControllers = toonControls; // Store for easy access
            this._updateToonControlsVisibility(instanceObject); // Set initial visibility

            // materialFolder.open(); // Optional
        }

        // Rotation Folder
        const rotationFolder = guiFolder.addFolder('Rotation');
        controllers.push(
            rotationFolder.add(settings, 'autoRotate').name("Auto Rotate"),
            rotationFolder.add(settings.rotationSpeed, 'x', -Math.PI, Math.PI).name("Speed X").step(0.01),
            rotationFolder.add(settings.rotationSpeed, 'y', -Math.PI, Math.PI).name("Speed Y").step(0.01),
            rotationFolder.add(settings.rotationSpeed, 'z', -Math.PI, Math.PI).name("Speed Z").step(0.01)
        );
        // rotationFolder.open(); // Optional: Keep open

        // Color Controls
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


    // --- GUI Control Creation Helpers ---
    _createCommonGuiControls(instanceObject, guiFolder, settings, controllers) {
        // Basic Visibility and Audio Interaction
        controllers.push(
            guiFolder.add(settings, 'visible').name("Visible").onChange(val => instanceObject.visible = val),
            guiFolder.add(settings, 'audioInfluence', 0, 2).name("Audio Influence").step(0.1),
            guiFolder.add(settings, 'frequencyRange', ['low', 'mid', 'high']).name("Audio Freq Range"),
            guiFolder.add(settings, 'motionInfluenceFactor', 0, 1).name("Motion Influence").step(0.05)
        );

        // Material Controls (Wireframe for mesh types)
        if (['grid', 'sphere', 'torus', 'torusknot'].includes(settings.type)) {
            const material = instanceObject.material;
            controllers.push(
                guiFolder.add(settings, 'wireframe').name("Wireframe").onChange(val => material.wireframe = val)
            );
        }

        // Rotation Folder
        const rotationFolder = guiFolder.addFolder('Rotation');
        controllers.push(
            rotationFolder.add(settings, 'autoRotate').name("Auto Rotate"),
            rotationFolder.add(settings.rotationSpeed, 'x', -Math.PI, Math.PI).name("Speed X").step(0.01),
            rotationFolder.add(settings.rotationSpeed, 'y', -Math.PI, Math.PI).name("Speed Y").step(0.01),
            rotationFolder.add(settings.rotationSpeed, 'z', -Math.PI, Math.PI).name("Speed Z").step(0.01)
        );
        // rotationFolder.open(); // Optional: Keep open

        // Color Controls
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

        // Reset Button
        settings.resetFunc = () => { this.resetToDefaults(instanceObject); };
        controllers.push(guiFolder.add(settings, 'resetFunc').name("Reset Settings"));
    }

    _createGridGuiControls(instanceObject, guiFolder, settings, controllers) {
        controllers.push(
            guiFolder.add(settings, 'heightScale', 0.1, 10).name("Height Scale").step(0.1),
            guiFolder.add(settings, 'colorMapping', ['height', 'audio', 'combined', 'frequencyBands']).name("Color Mapping"),
            guiFolder.add(settings, 'wavePattern', ['radial', 'linear', 'random', 'sineWave', 'checkerboard', 'ripple']).name("Wave Pattern")
        );
    }

    _createPointCloudGuiControls(instanceObject, guiFolder, settings, controllers) {
        const material = instanceObject.material;
        controllers.push(
            guiFolder.add(settings, 'particleSize', 0.01, 1.0).name("Particle Size").step(0.01).onChange(val => material.size = val),
            guiFolder.add(settings, 'distribution', ['sphere', 'cube', 'plane']).name("Distribution").onChange(() => this.resetObjectInitialGeometry(instanceObject)),
            guiFolder.add(settings, 'distributionScale', 1, 50).name("Dist Scale").step(1).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
            guiFolder.add(settings, 'displacementScale', 0, 10).name("Displace Scale").step(0.1),
            guiFolder.add(settings, 'displacementMode', ['radial', 'frequencyBandDisplacement']).name("Displace Mode"),
            guiFolder.add(settings, 'colorMapping', ['audio', 'frequencyBands']).name("Color Mapping")
        );
    }

    _createSphereGuiControls(instanceObject, guiFolder, settings, controllers) {
        controllers.push(
            guiFolder.add(settings, 'radius', 1, 20).name("Radius").step(0.5).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
            guiFolder.add(settings, 'widthSegments', 3, 64).name("Width Segments").step(1).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
            guiFolder.add(settings, 'heightSegments', 2, 32).name("Height Segments").step(1).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
            guiFolder.add(settings, 'displacementScale', 0, 5).name("Displace Scale").step(0.1),
            guiFolder.add(settings, 'colorMapping', ['audio', 'frequencyBands', 'normal']).name("Color Mapping")
        );
    }

    _createTorusGuiControls(instanceObject, guiFolder, settings, controllers) {
        controllers.push(
            guiFolder.add(settings, 'radius', 1, 20).name("Radius").step(0.5).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
            guiFolder.add(settings, 'tube', 0.1, 10).name("Tube Radius").step(0.1).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
            guiFolder.add(settings, 'radialSegments', 3, 64).name("Radial Segments").step(1).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
            guiFolder.add(settings, 'tubularSegments', 3, 64).name("Tubular Segments").step(1).onChange(() => this.resetObjectInitialGeometry(instanceObject)),
            guiFolder.add(settings, 'displacementScale', 0, 5).name("Displace Scale").step(0.1),
            guiFolder.add(settings, 'colorMapping', ['audio', 'frequencyBands', 'normal']).name("Color Mapping")
        );
    }

    _createTorusKnotGuiControls(instanceObject, guiFolder, settings, controllers) {
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
    }
    // --- End GUI Control Creation Helpers ---

    _updateToonControlsVisibility(instance) {
        if (!instance || !instance.userData || !instance.userData.toonMaterialControllers) return;
        const display = instance.userData.settings.materialType === 'ToonMaterial' ? 'block' : 'none';
        instance.userData.toonMaterialControllers.forEach(controller => {
            controller.domElement.style.display = display;
        });
    }


    _updateInstanceMaterial(instance, newMaterialType) {
        if (!instance || !instance.material) return;
        // Point clouds and grids currently don't support ToonMaterial in this setup
        if (instance.userData.settings.type === 'pointcloud' || instance.userData.settings.type === 'grid') {
            if (newMaterialType === 'ToonMaterial') {
                console.warn("ToonMaterial is not supported for point clouds or grids in the current setup.");
                 // Revert to previous material type or a default if trying to switch to Toon
                instance.userData.settings.materialType = instance.material.type === 'ShaderMaterial' ? 'MeshPhongMaterial' : instance.material.type.replace('THREE.', ''); // Fallback
                // Find the controller and update its display
                const matTypeController = instance.userData.controllers.find(c => c.property === 'materialType');
                if (matTypeController) matTypeController.setValue(instance.userData.settings.materialType);
                return;
            }
        }


        const oldMaterial = instance.material;
        const settings = instance.userData.settings;
        let newMaterial;

        // Common properties to preserve
        const preservedProps = {
            vertexColors: oldMaterial.vertexColors || false, // Default to false if undefined
            wireframe: settings.wireframe,
            side: oldMaterial.side || THREE.FrontSide, // Default if undefined
            map: oldMaterial.map,
        };

        if (newMaterialType === 'ToonMaterial') {
            const toonUniforms = THREE.UniformsUtils.clone(ToonShader.uniforms);

            // Set initial values from settings or defaults
            toonUniforms.diffuse.value = settings.lowColor; // Use lowColor as a base diffuse for toon for now
            if (preservedProps.map) {
                toonUniforms.map.value = preservedProps.map;
                toonUniforms.useMap = { value: true };
            } else {
                toonUniforms.useMap = { value: false };
            }
            toonUniforms.toonLevels.value = settings.toonLevels || 3;

            // These light uniforms would ideally be updated per frame or based on main scene lights.
            // For now, using static values or values from main.js directionalLight.
            // This part needs refinement to correctly use scene lights.
            // Example: Link to a primary directional light from the scene if available.
            // For simplicity, we'll use the default lightDirection from ToonShader for now.
            // It's better to pass light info from the main render loop or a light manager.

            newMaterial = new THREE.ShaderMaterial({
                uniforms: toonUniforms,
                vertexShader: ToonShader.vertexShader,
                fragmentShader: ToonShader.fragmentShader,
                lights: true, // Important: This tells Three.js to provide lighting uniforms
                vertexColors: preservedProps.vertexColors, // Crucial for audio-reactive colors to work
                wireframe: preservedProps.wireframe,
                side: preservedProps.side,
            });
        } else if (newMaterialType === 'MeshStandardMaterial') {
            newMaterial = new THREE.MeshStandardMaterial(preservedProps);
            // newMaterial.metalness = 0.5;
            // newMaterial.roughness = 0.5;
        } else { // Default to MeshPhongMaterial
            newMaterial = new THREE.MeshPhongMaterial(preservedProps);
        }

        if (!(newMaterial instanceof THREE.ShaderMaterial) && oldMaterial.color && !preservedProps.vertexColors) {
            newMaterial.color.copy(oldMaterial.color);
        }


        instance.material = newMaterial;
        oldMaterial.dispose();
        settings.materialType = newMaterialType;
        this._updateToonControlsVisibility(instance); // Update GUI for toon controls
        console.log(`Instance ${instance.uuid} material updated to ${newMaterialType}`);
    }

    _loadTextureToMaterial(instance, mapType, path) {
        if (!instance || !instance.material) return;
        if (instance.userData.settings.type === 'pointcloud') return; // Not for point clouds

        const material = instance.material;
        const settings = instance.userData.settings;

        // Dispose old texture if it exists for this mapType
        if (material[mapType] && material[mapType].isTexture) {
            material[mapType].dispose();
        }
        material[mapType] = null; // Clear it first

        if (path && typeof path === 'string' && path.trim() !== '') {
            this.textureLoader.load(
                path,
                (texture) => { // onLoad
                    material[mapType] = texture;
                    material.needsUpdate = true;
                    if (mapType === 'map') settings.diffuseMap = path; // Update setting
                    // Add similar updates for normalMap, emissiveMap etc. if those settings exist
                    console.log(`Texture "${path}" loaded to ${mapType} for instance ${instance.uuid}`);
                },
                undefined, // onProgress
                (error) => { // onError
                    console.error(`Failed to load texture "${path}":`, error);
                    if (mapType === 'map') settings.diffuseMap = null; // Clear setting on error
                }
            );
        } else {
            // Path is empty, ensure map is null and update setting
            if (mapType === 'map') settings.diffuseMap = null;
            material.needsUpdate = true; // Update material even if map is removed
        }
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
        const geometry = instance.geometry;

        console.log(`Resetting initial geometry for ${type} instance ${instance.uuid}`);

        // --- Point Cloud Specific ---
        if (type === 'pointcloud') {
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
            if (instanceToDelete.geometry) instanceToDelete.geometry.dispose();
            if (instanceToDelete.material) instanceToDelete.material.dispose();

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

    updateObject(instance, audioManager, motionScore, cameraSettings) {
        const settings = instance.userData.settings;
        if (!settings.visible) return;

        const type = settings.type;

        // Geometry/Color updates based on audio/motion
        if (type === 'grid') {
            this.updateGridGeometry(instance, audioManager, motionScore, cameraSettings);
        } else if (type === 'pointcloud') {
            this.updatePointCloudGeometry(instance, audioManager, motionScore, cameraSettings);
        } else if (type === 'sphere') {
            this.updateSphereGeometry(instance, audioManager, motionScore, cameraSettings);
        } else if (type === 'torus') {
            this.updateTorusGeometry(instance, audioManager, motionScore, cameraSettings);
        } else if (type === 'torusknot') {
            this.updateTorusKnotGeometry(instance, audioManager, motionScore, cameraSettings);
        }
    }

    // --- Geometry Update Functions ---

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
