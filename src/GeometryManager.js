import * as THREE from 'three';
// Shader source will be imported or defined here later
// import hyperbolicVertexShader from './shaders/hyperbolicVertex.glsl';
// import hyperbolicFragmentShader from './shaders/hyperbolicFragment.glsl';

// Shader source will be imported or defined here later
// For a production setup, these would be loaded from .glsl files, e.g. using Vite/Webpack plugins
// import hyperbolicVertexShaderText from './shaders/hyperbolicVertex.glsl?raw';
// import hyperbolicFragmentShaderText from './shaders/hyperbolicFragment.glsl?raw';

// Using string literals for hyperbolic shaders based on the content from .glsl files
const hyperbolicVertexShader = `
// Basic Placeholder - True Poincare/Hyperbolic shaders are much more complex
// This shader expects object positions to be somewhat pre-scaled for the disk.
// It doesn't perform true hyperbolic transformations from one model to another (e.g., Klein to Poincare).

uniform float diskRadius; // Visual radius of the Poincare disk in clip space or normalized device coordinates.
                         // A value of 1.0 would mean the disk touches the edges of the viewport if centered.
uniform vec2 poincareCenterOffset; // Offset of the Poincare disk's center from the screen center (NDC: [-1,1])

// A very simplified transformation:
// Assumes input 'position.xy' are coordinates within a conceptual [-1,1] square,
// and we want to map them into a disk.
// This is NOT a mathematically correct Poincare projection of hyperbolic space.
// It's more like a lens effect or a simple mapping to a circular area.
vec2 mapToDisk(vec2 pos, float radius) {
    // For a simple squish into a disk:
    // float len = length(pos);
    // if (len > 1.0) { // If points are outside a unit square/circle
    //     // Option 1: Clamp to edge (loses detail)
    //     // return normalize(pos) * radius;
    //     // Option 2: Discard (by sending to infinity or behind camera) - handled by clipping usually
    // }
    // This doesn't create the characteristic "fish-eye" of Poincare.
    return pos * radius; // Simple scaling
}

// True Poincare projection (from native Hyperboloid model (x,y,w) where w^2 - x^2 - y^2 = 1)
// vec2 projectToPoincare(vec3 hyperbolicCoords) {
//     // Assumes hyperbolicCoords.z is the 'w' component from hyperboloid model (time-like coordinate)
//     return vec2(hyperbolicCoords.x / (1.0 + hyperbolicCoords.z), hyperbolicCoords.y / (1.0 + hyperbolicCoords.z));
// }


void main() {
    vec3 transformedPosition = position;

    // --- Conceptual Poincare Disk Transformation ---
    // This is a placeholder for actual hyperbolic math.
    // For a true Poincare disk, vertices need to be in a hyperbolic space model
    // (e.g., the hyperboloid model) and then projected onto the disk.

    // Simplistic approach for visual effect:
    // Assume 'position.xy' are already "hyperbolic-like" coordinates.
    // We scale them by diskRadius to fit them visually into where the disk would be.
    // This does not create the characteristic distortion of objects near the boundary.

    // 1. Apply modelMatrix to get world space coordinates (Euclidean)
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);

    // 2. Transform world coordinates into "Poincare disk coordinates"
    // THIS IS THE CORE OF THE NON-EUCLIDEAN BEHAVIOR.
    // For a real implementation, this step would involve complex math.
    // Example: if worldPosition.xy are points on an infinite hyperbolic plane,
    // map them to the Poincare disk.
    // For now, let's just scale them as if they are already in a pre-defined plane
    // that we want to view as a disk.

    vec2 poincarePlanePos = worldPosition.xy; // Taking world X, Y

    // Apply a simple scaling to simulate fitting into a disk, then offset.
    // This is purely visual and not mathematically a Poincare projection.
    vec2 diskMappedPos = poincarePlanePos * diskRadius + poincareCenterOffset;

    // Reconstruct the position for the standard pipeline
    // We are projecting onto the camera's view plane, so Z is relative to camera.
    // The projectionMatrix will handle the perspective.
    // We are essentially creating a 2D effect on the XY plane in view space.
    // For a true 3D non-Euclidean effect, the viewMatrix and projectionMatrix
    // themselves might need to be non-standard, or the transformations here
    // would need to be much more sophisticated.

    // Using the standard pipeline after modifying XY:
    // The Z coordinate handling here is tricky. If we just use worldPosition.z,
    // it won't have the hyperbolic effect.
    // For a 2D Poincare effect, typically Z is flattened or used for layering.
    vec4 viewPosition = viewMatrix * vec4(diskMappedPos, worldPosition.z, 1.0);
    // A more common way for shaders is to output clip space:
    // gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(transformedPosition, 1.0);
    // So if 'transformedPosition' contains the Poincare coordinates in some sense:
    // Let's try to form the final gl_Position by transforming the modified XY and original Z.
    // This will effectively place objects on a plane and then apply the Poincare distortion to their XY.

    // Final position in clip space:
    // We take the original model-view transformed position, then replace its XY
    // with the Poincare-mapped XY (which also needs to be in view space).
    // This is getting complicated and likely incorrect for a general case.

    // Let's simplify: Assume the shader operates on vertices that are *already*
    // meant to be on the Poincare disk, and this shader just ensures they are rendered correctly.
    // The CPU would prepare vertices in hyperbolic coordinates.
    // This shader then projects them using view/projection.

    // Simplest interpretation for now:
    // Treat 'position' as Euclidean, apply all standard matrices,
    // THEN warp the final clip-space coordinates. This is a post-processing like effect.
    // vec4 clipPosition = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // vec2 screenPos = clipPosition.xy / clipPosition.w; // NDC
    // screenPos = mapToDisk(screenPos, diskRadius); // map NDC to disk shape
    // clipPosition.xy = screenPos * clipPosition.w;
    // gl_Position = clipPosition;

    // Let's try a more direct approach: transform vertices in object space to Poincare disk
    // and then apply view and projection. This is more standard for geometry shaders.
    // Assume 'position.xy' are the coordinates to be mapped to Poincare disk. Z is depth.
    vec2 mappedXY = mapToDisk(position.xy, diskRadius); // This is a simple scale, not Poincare
                                                        // For real Poincare, this function needs to be hyperbolic.

    // Apply offset in what space? If diskRadius is in NDC, offset is too.
    // This implies the mapping should happen *after* projection to clip space.
    // This is why full non-Euclidean renderers often use raytracing or custom pipelines.

    // Backtrack: The vertex shader's primary role is to output gl_Position in clip space.
    // The transformation to non-Euclidean space should happen *before* applying view and projection matrices
    // if we want the camera to move through that space correctly.

    // Hyperboloid model projection: (x,y,z) are coords on hyperboloid z^2 - x^2 - y^2 = R^2
    // projected to Poincare disk: (x / (R+z), y / (R+z)) * R_disk_visual_radius
    // This implies the 'position' attribute should store hyperboloid coordinates.
    // For now, we don't have that. We have Euclidean 'position'.

    // Let's stick to a very simple visual effect: scale down XY based on diskRadius.
    // This is not hyperbolic geometry, but a step toward custom vertex transformations.
    transformedPosition.xy = position.xy * diskRadius; // Scale in object space
    transformedPosition.xy += poincareCenterOffset; // Offset in object space (might be weird)

    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformedPosition, 1.0);
}
`;

const hyperbolicFragmentShader = `
uniform vec3 objectColor;
uniform float diskRadius; // Visual radius of the Poincare disk (e.g., in NDC, 0.0 to 1.0)
uniform vec2 poincareCenterOffset; // Center of the disk in NDC

varying vec4 vWorldPosition; // If passed from vertex shader
varying vec2 vPoincareCoords; // If specific Poincare coordinates are passed

void main() {
    // To clip fragments outside the disk, we need to know their position relative to the disk center.
    // This is typically done in Normalized Device Coordinates (NDC) or screen space.
    // gl_FragCoord.xy gives window coordinates. We need to map this to NDC.
    // vec2 ndc = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0; // u_resolution would be a uniform for viewport size

    // However, clipping is more efficiently done using discard in the fragment shader based on some
    // coordinates calculated in the vertex shader and passed via varyings.

    // If vPoincareCoords (representing coordinates *within* the Poincare disk, e.g., after projection)
    // were passed from the vertex shader:
    // if (length(vPoincareCoords) > diskRadius) { // Assuming diskRadius is the radius in that vPoincareCoord space
    //     discard;
    // }

    // For a simpler visual clip based on final screen position (less performant for complex scenes):
    // This requires knowing the viewport resolution.
    // For now, let's assume the geometry is already shaped like a disk by the vertex shader
    // or by the mesh itself. The fragment shader just colors it.

    // A common technique is to use a discard based on some property.
    // For example, if the vertex shader transformed things such that anything outside the
    // disk gets a specific Z value or a specific varying flag.

    // If we want to make a circular boundary for objects that are otherwise square:
    // We need the fragment's position relative to the object's center in its local XY plane,
    // then check if it's within a radius. This requires passing local coordinates or UVs.

    // Given the current vertex shader is very basic and mostly scales,
    // this fragment shader will also be simple.
    // The "diskRadius" and "poincareCenterOffset" in the vertex shader are applied to vertices.
    // If we want to clip fragments to form a perfect circle *after* that vertex transformation,
    // we need to calculate the fragment's distance from the *transformed* center in screen space.

    // Let's just color the fragment. The actual "shape" of the hyperbolic space
    // is primarily defined by the vertex shader's transformations.
    gl_FragColor = vec4(objectColor, 1.0);

    // Example of how one might clip to a visual disk if gl_Position was unmodified Euclidean
    // and we wanted to draw a 2D circle mask. This is NOT for true hyperbolic rendering.
    // vec2 screen_uv = gl_FragCoord.xy / screenResolutionUniform; // screenResolutionUniform = vec2(width, height)
    // vec2 centered_uv = screen_uv - 0.5; // Center UVs
    // float dist_from_center = length(centered_uv * 2.0); // Now in range roughly 0-1 from center
    // if (dist_from_center > diskRadiusVisual) { // diskRadiusVisual could be 0.9 for 90% of screen
    //     discard;
    // }
}
`;

export class GeometryManager {
    /** @type {THREE.Scene} */
    scene;
    /** @type {THREE.Camera} */
    camera;
    /** @type {'euclidean' | 'hyperbolic' | 'spherical'} */
    currentSpace = 'euclidean';

    /** @type {Map<string, THREE.Material>} */
    originalMaterials = new Map(); // To store original materials when switching

    /** @type {THREE.ShaderMaterial | null} */
    hyperbolicMaterial = null;

    /**
     * @param {THREE.Scene} scene
     * @param {THREE.Camera} camera
     */
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // Initialize materials (can be done on-demand too)
        this.hyperbolicMaterial = new THREE.ShaderMaterial({
            vertexShader: hyperbolicVertexShader,
            fragmentShader: hyperbolicFragmentShader,
            uniforms: {
                diskRadius: { value: 1.0 }, // Default visual radius for the disk. 1.0 might mean it fills a -1 to 1 range.
                poincareCenterOffset: { value: new THREE.Vector2(0, 0) }, // Default center of the disk.
                objectColor: { value: new THREE.Color(0x00ff00) },
            },
            // side: THREE.DoubleSide, // Enable if backfaces might be visible or if geometry isn't watertight
        });
    }

    /**
     * @param {'euclidean' | 'hyperbolic' | 'spherical'} type
     * @param {any} [options] Options specific to the geometry type.
     *                        For 'hyperbolic': { diskRadius?: number, poincareCenterOffset?: THREE.Vector2 }
     */
    setSpace(type, options = {}) {
        if (this.currentSpace === type && type !== 'hyperbolic') return; // Allow re-setting hyperbolic with new options

        const oldSpace = this.currentSpace;
        this.currentSpace = type;
        console.log(`Switching from ${oldSpace} to ${type} space`);

        // Restore original materials if switching from a custom space
        if (oldSpace === 'hyperbolic' && type !== 'hyperbolic') {
            this.scene.traverse((object) => {
                if (object instanceof THREE.Mesh) {
                    this.restoreOriginalMaterial(object);
                }
            });
        }

        if (type === 'hyperbolic') {
            if (!this.hyperbolicMaterial) {
                console.error("Hyperbolic material not initialized!");
                return;
            }
            if (options.diskRadius !== undefined) {
                this.hyperbolicMaterial.uniforms.diskRadius.value = options.diskRadius;
            }
            if (options.poincareCenterOffset !== undefined) {
                this.hyperbolicMaterial.uniforms.poincareCenterOffset.value.copy(options.poincareCenterOffset);
            }

            // Apply to all current meshes or re-apply if options changed
            this.scene.traverse((object) => {
                if (object instanceof THREE.Mesh) {
                    this.switchToHyperbolicMaterial(object, options); // Pass options for potential per-object setup
                }
            });
        } else if (type === 'euclidean') {
            this.scene.traverse((object) => {
                if (object instanceof THREE.Mesh) {
                    this.restoreOriginalMaterial(object);
                }
            });
        }
        // Add 'spherical' later
    }

    /**
     * Called by EnvironmentManager when a new object is loaded.
     * @param {THREE.Object3D} object
     */
    processNewObject(object) {
        if (this.currentSpace === 'hyperbolic') {
            object.traverse((node) => {
                if (node instanceof THREE.Mesh) {
                    this.switchToHyperbolicMaterial(node);
                }
            });
        }
        // Other spaces might also need processing
    }

    /**
     * @param {THREE.Mesh} mesh
     */
    switchToHyperbolicMaterial(mesh) {
        if (!this.originalMaterials.has(mesh.uuid)) {
            this.originalMaterials.set(mesh.uuid, mesh.material);
        }
        // Create a new material instance if we want per-object color or other unique uniforms
        const newHyperbolicMaterial = this.hyperbolicMaterial.clone();
        if (mesh.material.color) { // Try to preserve original color
            newHyperbolicMaterial.uniforms.objectColor.value.copy(mesh.material.color);
        } else {
             newHyperbolicMaterial.uniforms.objectColor.value.setHex(Math.random() * 0xffffff);
        }
        mesh.material = newHyperbolicMaterial;
    }

    /**
     * @param {THREE.Mesh} mesh
     */
    restoreOriginalMaterial(mesh) {
        const originalMaterial = this.originalMaterials.get(mesh.uuid);
        if (originalMaterial) {
            mesh.material = originalMaterial;
            this.originalMaterials.delete(mesh.uuid);
        }
    }

    updateWorld() {
        // Update uniforms or perform other per-frame logic for the current geometry
        if (this.currentSpace === 'hyperbolic' && this.hyperbolicMaterial) {
            // Example: Animate camera position in hyperbolic space
            // this.hyperbolicMaterial.uniforms.cameraHyperbolicPosition.value.x += 0.001;
            // This would need to be applied to all meshes using this material or managed globally
        }
    }

    dispose() {
        // Restore all original materials
        this.originalMaterials.forEach((material, uuid) => {
            const object = this.scene.getObjectByProperty('uuid', uuid);
            if (object instanceof THREE.Mesh) {
                object.material = material;
            }
        });
        this.originalMaterials.clear();
        if (this.hyperbolicMaterial) {
            this.hyperbolicMaterial.dispose();
        }
        // Dispose other materials
    }
}
