import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
// Potentially more loaders if needed, e.g., FBXLoader

/**
 * @typedef {object} LoadOptions
 * @property {string} [name]
 * @property {THREE.Vector3} [position]
 * @property {THREE.Euler} [rotation]
 * @property {THREE.Vector3} [scale]
 * @property {boolean} [castShadow]
 * @property {boolean} [receiveShadow]
 * @property {boolean} [interactive]
 * @property {boolean} [isDraggable] // Added for InteractionManager V2
 * @property {any} [meta]
 * @property {'gltf' | 'glb' | 'obj' | string} [filetype] // Explicit filetype, otherwise inferred from URL
 * @property {THREE.Object3D} [parent] // For scene graph hierarchy
 */

export class EnvironmentManager {
    /** @type {THREE.Scene} */
    scene;
    /** @type {THREE.Camera} */
    camera;
    /** @type {THREE.WebGLRenderer} */
    renderer;
    /** @type {Map<string, THREE.Object3D>} */
    managedObjects = new Map();
    /** @type {InteractionManager | null} */
    interactionManager = null;
    /** @type {any | null} */ // Replace 'any' with GeometryManager later
    geometryManager = null;

    /** @type {GLTFLoader} */
    gltfLoader;
    /** @type {OBJLoader} */
    objLoader;

    /**
     * @param {THREE.Scene} scene
     * @param {THREE.Camera} camera
     * @param {THREE.WebGLRenderer} renderer
     */
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;

        this.gltfLoader = new GLTFLoader();
        this.objLoader = new OBJLoader();
    }

    /**
     * @param {InteractionManager} interactionManager
     */
    setInteractionManager(interactionManager) {
        this.interactionManager = interactionManager;
    }

    /**
     * @param {any} geometryManager // Replace 'any' with GeometryManager later
     */
    setGeometryManager(geometryManager) {
        this.geometryManager = geometryManager;
    }

    /**
     * Loads a 3D model and adds it to the scene.
     * @param {string} url Path to the 3D model file.
     * @param {LoadOptions} [options={}]
     * @returns {Promise<THREE.Group | THREE.Object3D>}
     */
    async loadObject(url, options = {}) {
        const objectName = options.name || `object-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        let loadedObject;

        const filetype = options.filetype || this._inferFiletype(url);

        try {
            switch (filetype) {
                case 'gltf':
                case 'glb':
                    const gltf = await this.gltfLoader.loadAsync(url);
                    loadedObject = gltf.scene;
                    break;
                case 'obj':
                    loadedObject = await this.objLoader.loadAsync(url);
                    break;
                // Add cases for other loaders (FBX, etc.) if needed
                default:
                    console.warn(`Unsupported file type: ${filetype} for URL: ${url}. Attempting GLTF load.`);
                    // Fallback or throw error
                    const gltfDefault = await this.gltfLoader.loadAsync(url);
                    loadedObject = gltfDefault.scene;
                    break;
            }
        } catch (error) {
            console.error(`Error loading object from ${url}:`, error);
            throw error;
        }

        loadedObject.name = objectName;

        if (options.position) loadedObject.position.copy(options.position);
        if (options.rotation) loadedObject.rotation.copy(options.rotation);
        if (options.scale) loadedObject.scale.copy(options.scale);

        loadedObject.traverse((node) => {
            if (node instanceof THREE.Mesh) {
                node.castShadow = options.castShadow !== undefined ? options.castShadow : true;
                node.receiveShadow = options.receiveShadow !== undefined ? options.receiveShadow : true;
            }
        });

        if (options.meta) {
            loadedObject.userData = { ...loadedObject.userData, ...options.meta };
        }

        loadedObject.userData.isInteractive = !!options.interactive;
        // Explicitly set isDraggable, defaults to true if interactive, false otherwise
        if (options.interactive) {
            loadedObject.userData.isDraggable = options.isDraggable !== undefined ? options.isDraggable : true;
        } else {
            loadedObject.userData.isDraggable = options.isDraggable || false; // Can't be draggable if not interactive
        }


        const parentObject = options.parent || this.scene;
        parentObject.add(loadedObject);

        this.managedObjects.set(objectName, loadedObject);

        if (loadedObject.userData.isInteractive && this.interactionManager) {
            this.interactionManager.addInteractiveObject(loadedObject);
        }

        // If a geometry manager is active, it might need to process the new object
        if (this.geometryManager && this.geometryManager.processNewObject) {
            this.geometryManager.processNewObject(loadedObject);
        }

        return loadedObject;
    }

    /**
     * @param {string} url
     * @returns {string}
     */
    _inferFiletype(url) {
        const extension = url.split('.').pop()?.toLowerCase();
        if (extension === 'gltf' || extension === 'glb' || extension === 'obj') {
            return extension;
        }
        // Add more inferences if needed
        console.warn(`Could not infer filetype from URL: ${url}. Defaulting to 'gltf'.`);
        return 'gltf'; // Default assumption
    }

    /**
     * @param {string} nameOrId
     */
    removeObject(nameOrId) {
        const object = this.managedObjects.get(nameOrId);
        if (object) {
            if (object.userData.isInteractive && this.interactionManager) {
                this.interactionManager.removeInteractiveObject(object);
            }

            // Remove from its parent, which might not be the main scene
            if (object.parent) {
                object.parent.remove(object);
            } else {
                // Fallback if for some reason it has no parent but was managed
                this.scene.remove(object);
            }

            // Proper disposal of geometries, materials, textures if necessary
            object.traverse((node) => {
                if (node instanceof THREE.Mesh) {
                    node.geometry?.dispose();
                    if (Array.isArray(node.material)) {
                        node.material.forEach(material => material.dispose());
                    } else if (node.material) {
                        node.material.dispose();
                    }
                }
            });
            this.managedObjects.delete(nameOrId);
        } else {
            console.warn(`Object with name/ID "${nameOrId}" not found for removal.`);
        }
    }

    /**
     * @param {string} nameOrId
     * @returns {THREE.Object3D | undefined}
     */
    getObject(nameOrId) {
        return this.managedObjects.get(nameOrId);
    }

    /**
     * @returns {THREE.Object3D[]}
     */
    getAllObjects() {
        return Array.from(this.managedObjects.values());
    }

    /**
     * @param {string} nameOrId
     * @param {boolean} visible
     */
    setObjectVisibility(nameOrId, visible) {
        const object = this.getObject(nameOrId);
        if (object) {
            object.visible = visible;
        } else {
            console.warn(`Object with name/ID "${nameOrId}" not found for visibility change.`);
        }
    }

    /**
     * @param {string} nameOrId
     * @param {THREE.Matrix4} matrix
     */
    setObjectMatrix(nameOrId, matrix) {
        const object = this.getObject(nameOrId);
        if (object) {
            object.matrix.copy(matrix);
            object.matrixWorldNeedsUpdate = true; // Important for three.js to recognize the change
        } else {
            console.warn(`Object with name/ID "${nameOrId}" not found for matrix update.`);
        }
    }

    // Scene property methods (to be expanded later)
    /**
     * @param {THREE.Color | THREE.Texture | null} background
     */
    setBackground(background) {
        if (background === null) {
            this.scene.background = null;
        } else if (background instanceof THREE.Color || background instanceof THREE.Texture) {
            this.scene.background = background;
        } else {
            console.warn("Invalid background type. Use THREE.Color or THREE.Texture.");
        }
    }

    /**
     * @param {THREE.Fog | THREE.FogExp2 | null} fog
     */
    setFog(fog) {
         if (fog === null) {
            this.scene.fog = null;
        } else if (fog instanceof THREE.Fog || fog instanceof THREE.FogExp2) {
            this.scene.fog = fog;
        } else {
            console.warn("Invalid fog type. Use THREE.Fog or THREE.FogExp2.");
        }
    }

    /**
     * @param {boolean} enable
     * @param {THREE.Light[]} [lightsToCastShadow]
     */
    enableShadows(enable, lightsToCastShadow = []) {
        this.renderer.shadowMap.enabled = enable;
        if (enable) {
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Or other types

            // Configure lights that should cast shadows
            lightsToCastShadow.forEach(light => {
                if (light.castShadow !== undefined) {
                    light.castShadow = true;
                    // Configure shadow properties for each light if needed
                    // light.shadow.mapSize.width = 1024;
                    // light.shadow.mapSize.height = 1024;
                    // light.shadow.camera.near = 0.5;
                    // light.shadow.camera.far = 500;
                }
            });
        }
        // Objects need to be configured to cast/receive shadows individually via loadObject options
    }

    dispose() {
        // Remove all objects and dispose them
        this.getAllObjects().forEach(obj => this.removeObject(obj.name));
        this.managedObjects.clear();
        // Any other cleanup specific to EnvironmentManager
        // Note: scene, camera, renderer are managed externally
    }
}
