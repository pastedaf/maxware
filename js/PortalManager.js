import * as THREE from 'three';

const PORTAL_WIDTH = 2;
const PORTAL_HEIGHT = 3;
const RENDER_TARGET_SIZE_DIVISOR = 2; // Render target size will be screen_size / divisor

class Portal {
    constructor(scene, position = new THREE.Vector3(), rotation = new THREE.Euler(), normal = new THREE.Vector3(0, 0, 1)) {
        this.scene = scene;
        this.position = position;
        this.rotation = rotation;
        this.normal = normal.normalize(); // Ensure normal is normalized

        this.renderTarget = new THREE.WebGLRenderTarget(
            Math.floor(window.innerWidth / RENDER_TARGET_SIZE_DIVISOR),
            Math.floor(window.innerHeight / RENDER_TARGET_SIZE_DIVISOR),
            {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.NearestFilter,
                format: THREE.RGBAFormat,
                stencilBuffer: false // Individual portal render targets don't need stencil
            }
        );

        const portalGeometry = new THREE.PlaneGeometry(PORTAL_WIDTH, PORTAL_HEIGHT);
        const portalMaterial = new THREE.MeshBasicMaterial({
            map: this.renderTarget.texture,
            // side: THREE.DoubleSide, // Enable if you want to see portal from behind
        });

        this.mesh = new THREE.Mesh(portalGeometry, portalMaterial);
        this.mesh.position.copy(this.position);
        this.mesh.rotation.copy(this.rotation);

        // Helper to visualize the portal normal
        this.arrowHelper = new THREE.ArrowHelper(this.normal, this.mesh.position, 1, 0xffff00);
        this.scene.add(this.arrowHelper);

        this.scene.add(this.mesh);
        this.linkedPortal = null;

        // A camera that will render what this portal "sees" (i.e., the view from the linked portal)
        this.virtualCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.scene.add(this.virtualCamera); // Add to scene so it can be transformed relative to world
    }

    setLinkedPortal(portal) {
        this.linkedPortal = portal;
    }

    // Update portal's world matrix and normal
    updateMatrixWorld(force) {
        this.mesh.updateMatrixWorld(force);
        // Update the normal based on the portal's world rotation
        this.normal.set(0, 0, 1).applyQuaternion(this.mesh.quaternion).normalize();
        this.arrowHelper.position.copy(this.mesh.position);
        this.arrowHelper.setDirection(this.normal);
    }

    // Render the view from the linked portal into this portal's render target
    renderView(renderer, scene, mainCamera) {
        if (!this.linkedPortal || !this.linkedPortal.mesh) return;

        // 1. Position and orient the virtualCamera at the linked portal's position,
        // looking in the direction of the linked portal's normal, but transformed
        // by the main camera's relative position/orientation to this portal.

        const mainCamPos = new THREE.Vector3();
        const mainCamQuat = new THREE.Quaternion();
        mainCamera.getWorldPosition(mainCamPos);
        mainCamera.getWorldQuaternion(mainCamQuat);

        // Matrix of this portal (where the player is looking *to*)
        const thisPortalMatrix = this.mesh.matrixWorld;

        // Matrix of the linked portal (where the virtual camera should be *from*)
        const linkedPortalMatrix = this.linkedPortal.mesh.matrixWorld;

        // Calculate the transformation from the main camera to this portal
        // Inverse of this portal's matrix times the main camera's world matrix
        const camToThisPortalMatrix = new THREE.Matrix4().multiplyMatrices(
            new THREE.Matrix4().copy(thisPortalMatrix).invert(), // from world to this portal's local space
            mainCamera.matrixWorld                          // from local camera to world space
        );

        // Now, transform the virtual camera by this relative matrix, but starting from the linked portal's frame
        // We also need to apply a 180-degree rotation around the Y-axis of the linked portal
        // because you're looking "out" of the linked portal, which is the opposite direction
        // of how you'd look "into" it.
        const rotationY180 = new THREE.Matrix4().makeRotationY(Math.PI);

        this.virtualCamera.matrixWorld.copy(linkedPortalMatrix) // Start at the linked portal
            .multiply(rotationY180) // Turn around
            .multiply(camToThisPortalMatrix); // Apply the relative transform

        // Decompose the final matrixWorld to set position, quaternion for the virtual camera
        this.virtualCamera.matrixWorld.decompose(
            this.virtualCamera.position,
            this.virtualCamera.quaternion,
            this.virtualCamera.scale
        );

        // Update projection matrix for the virtual camera based on the main camera's properties
        // This is a simplified approach for oblique frustum, more accurate methods exist
        this.virtualCamera.fov = mainCamera.fov;
        this.virtualCamera.aspect = mainCamera.aspect;
        this.virtualCamera.near = mainCamera.near; // Potentially adjust near/far for portal context
        this.virtualCamera.far = mainCamera.far;

        // Oblique Frustum Culling: Adjust projection matrix to clip at portal plane
        // This prevents rendering objects behind the portal plane itself.
        const portalPlane = new THREE.Plane();
        const portalNormalWorld = new THREE.Vector3();
        this.linkedPortal.mesh.getWorldDirection(portalNormalWorld); // Get normal of the *target* portal for clipping

        portalPlane.setFromNormalAndCoplanarPoint(portalNormalWorld, this.linkedPortal.mesh.position);
        const viewSpacePlane = portalPlane.clone().applyMatrix4(this.virtualCamera.matrixWorldInverse);
        this.virtualCamera.projectionMatrix = mainCamera.projectionMatrix.clone(); // Start with main camera's projection
        this.virtualCamera.projectionMatrix = this.obliqueNearPlaneClip(this.virtualCamera, viewSpacePlane);


        // Temporarily hide this portal's mesh to avoid rendering it into its own texture
        const originalVisibility = this.mesh.visible;
        this.mesh.visible = false;

        // Render the scene from the virtual camera's perspective to this portal's render target
        renderer.setRenderTarget(this.renderTarget);
        renderer.clear();
        renderer.render(scene, this.virtualCamera);

        // Restore visibility
        this.mesh.visible = originalVisibility;
    }

    // Helper function for oblique frustum culling
    // Adapted from Three.js examples and other sources
    obliqueNearPlaneClip(camera, plane) {
        const projectionMatrix = camera.projectionMatrix.clone();
        const q = new THREE.Vector4();
        const clipPlane = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
        clipPlane.applyMatrix4(camera.projectionMatrixInverse); // Transform clip plane to clip space

        if (clipPlane.w > 0) { // If the camera is looking at the front of the plane
            q.x = (Math.sign(clipPlane.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0];
            q.y = (Math.sign(clipPlane.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5];
            q.z = -1.0;
            q.w = (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];
        } else { // Camera is looking at the back of the plane or is on the plane
            q.x = (Math.sign(clipPlane.x) - projectionMatrix.elements[8]) / projectionMatrix.elements[0];
            q.y = (Math.sign(clipPlane.y) - projectionMatrix.elements[9]) / projectionMatrix.elements[5];
            q.z = 1.0;
            q.w = (-1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];
        }

        const s = 2.0 / clipPlane.dot(q);
        projectionMatrix.elements[2] = s * clipPlane.x;
        projectionMatrix.elements[6] = s * clipPlane.y;
        projectionMatrix.elements[10] = s * clipPlane.z + 1.0; // Offset z to align with near plane
        projectionMatrix.elements[14] = s * clipPlane.w;

        return projectionMatrix;
    }


    dispose() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.renderTarget.dispose();
        this.scene.remove(this.arrowHelper);
        this.scene.remove(this.virtualCamera);
    }

    resizeRenderTargets() {
        this.renderTarget.setSize(
            Math.floor(window.innerWidth / RENDER_TARGET_SIZE_DIVISOR),
            Math.floor(window.innerHeight / RENDER_TARGET_SIZE_DIVISOR)
        );
        this.virtualCamera.aspect = window.innerWidth / window.innerHeight;
        this.virtualCamera.updateProjectionMatrix();
    }
}


export class PortalManager {
    constructor(scene, renderer, mainCamera, objectManager) { // Added objectManager
        this.scene = scene;
        this.renderer = renderer;
        this.mainCamera = mainCamera;
        this.objectManager = objectManager; // Store objectManager
        this.portals = []; // Stores Portal instances
        this.portalPairs = []; // Stores { portalA: Portal, portalB: Portal }

        this.recursionDepth = 0;
        this.maxRecursionDepth = 2; // Prevent excessive recursion
    }

    createPortalPair(positionA, rotationA, positionB, rotationB) {
        const portalA = new Portal(this.scene, positionA, rotationA);
        const portalB = new Portal(this.scene, positionB, rotationB);

        portalA.setLinkedPortal(portalB);
        portalB.setLinkedPortal(portalA);

        this.portals.push(portalA, portalB);
        this.portalPairs.push({ portalA, portalB });

        // Register portal meshes with ObjectManager
        if (this.objectManager) {
            // Add some userData to identify them as portals if needed by ObjectManager
            portalA.mesh.userData.isPortal = true;
            portalA.mesh.userData.portalInstance = portalA; // Link back to Portal object
            this.objectManager.addInstance('portal', null, portalA.mesh);

            portalB.mesh.userData.isPortal = true;
            portalB.mesh.userData.portalInstance = portalB; // Link back to Portal object
            this.objectManager.addInstance('portal', null, portalB.mesh);

            console.log("Registered portal meshes with ObjectManager.");
        }

        console.log("Created portal pair:", portalA, portalB);
        return { portalA, portalB };
    }

    // This is the main update function to be called in the animation loop BEFORE the main scene render
    updatePortals() {
        // Update portal positions/rotations from their mesh (if moved by TransformControls)
        this.portals.forEach(portal => {
            if (portal.mesh.userData.isPortal) { // Check if it's a portal mesh managed by ObjectManager
                portal.position.copy(portal.mesh.position);
                portal.rotation.copy(portal.mesh.rotation);
                portal.updateMatrixWorld(true); // Force update of matrix and normal vector display
            }
        });

        if (this.recursionDepth >= this.maxRecursionDepth) {
            return;
        }
        this.recursionDepth++;

        const originalRenderTarget = this.renderer.getRenderTarget();
        const originalClearAlpha = this.renderer.getClearAlpha();
        const originalScissorTest = this.renderer.getScissorTest();
        this.renderer.setScissorTest(false); // Ensure scissor test is off for portal rendering

        this.portals.forEach(portal => {
            if (portal.mesh.visible && portal.linkedPortal && portal.linkedPortal.mesh.visible) {
                // Hide the other portal when rendering this one's view to avoid self-reflection issues
                const linkedPortalVisibility = portal.linkedPortal.mesh.visible;
                portal.linkedPortal.mesh.visible = false;

                portal.renderView(this.renderer, this.scene, this.mainCamera);

                portal.linkedPortal.mesh.visible = linkedPortalVisibility;
            }
        });

        this.renderer.setRenderTarget(originalRenderTarget);
        this.renderer.setClearAlpha(originalClearAlpha);
        this.renderer.setScissorTest(originalScissorTest);

        this.recursionDepth--;
    }

    // This function should be called INSTEAD of the direct renderer.render(scene, camera)
    // It handles rendering portals with stencil operations.
    render(scene, camera) {
        // 1. First, update all portal textures (render views from linked portals)
        this.updatePortals();

        // 2. Render the main scene with stencil operations for each portal
        const gl = this.renderer.getContext();
        this.renderer.autoClear = false; // We'll handle clearing manually
        this.renderer.clear(); // Clear color, depth, and stencil

        // Render non-portal objects first (optional, depends on desired effect)
        // For simplicity, we'll render everything "through" portals as needed.

        camera.updateMatrixWorld(); // Ensure camera matrix is up to date

        this.portals.forEach(portal => {
            if (!portal.mesh.visible || !portal.linkedPortal || !portal.linkedPortal.mesh.visible) {
                return; // Skip if portal or its link is not visible
            }

            // --- Stencil Setup for this Portal ---
            this.renderer.state.buffers.stencil.setTest(true);

            // Phase 1: Render portal shape to stencil buffer
            this.renderer.state.buffers.color.setMask(false); // Don't write to color buffer
            this.renderer.state.buffers.depth.setMask(true);  // DO write to depth buffer for portal shapes
            this.renderer.state.buffers.stencil.setFunc(gl.ALWAYS, 1, 0xff);
            this.renderer.state.buffers.stencil.setOp(gl.KEEP, gl.KEEP, gl.REPLACE); // Replace stencil value where portal is drawn
            // Stencil clear is handled by renderer.clear() at the beginning of this.render
            // this.renderer.state.buffers.stencil.setClear(0); // Not needed here if cleared globally

            // Render the portal mesh (just its shape)
            // Temporarily disable its map to ensure we're only writing stencil
            const originalMaterial = portal.mesh.material;
            portal.mesh.material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: originalMaterial.side }); // Dummy material

            this.renderer.render(portal.mesh, camera); // Render only the portal mesh to stencil

            portal.mesh.material = originalMaterial; // Restore original material

            // Phase 2: Render the portal's view (texture) where stencil is set
            this.renderer.state.buffers.color.setMask(true); // Enable color writes
            this.renderer.state.buffers.depth.setMask(true); // Enable depth writes
            this.renderer.state.buffers.stencil.setFunc(gl.EQUAL, 1, 0xff); // Draw only where stencil == 1
            this.renderer.state.buffers.stencil.setOp(gl.KEEP, gl.KEEP, gl.KEEP); // Don't change stencil buffer

            // Render the portal mesh again, this time with its texture
            // The texture is already set from updatePortals()
            this.renderer.render(portal.mesh, camera);

            // Clean up stencil test for the next portal or main scene
            this.renderer.state.buffers.stencil.setTest(false);
        });

        // Phase 3: Render the rest of the scene (objects not seen through portals)
        // Ensure stencil test is off
        this.renderer.state.buffers.stencil.setTest(false);
        // Hide portal meshes when rendering the main scene to avoid drawing them "on top" of their stenciled content
        this.portals.forEach(p => p.mesh.visible = false);

        this.renderer.render(scene, camera); // Render the main scene elements

        this.portals.forEach(p => p.mesh.visible = true); // Restore portal visibility for next frame's logic

        this.renderer.autoClear = true; // Reset autoClear
    }


    dispose() {
        this.portals.forEach(portal => portal.dispose());
        this.portals = [];
        this.portalPairs = [];
    }

    // Call this on window resize
    onWindowResize() {
        this.portals.forEach(portal => {
            portal.resizeRenderTargets();
        });
    }

    // Add GUI controls for portals (example)
    addGuiControls(gui) {
        const portalFolder = gui.addFolder('Portals');
        const params = {
            addPair: () => {
                const posA = new THREE.Vector3(
                    (Math.random() - 0.5) * 10,
                    PORTAL_HEIGHT / 2,
                    (Math.random() - 0.5) * 10 - 5
                );
                const rotA = new THREE.Euler(0, Math.random() * Math.PI * 2, 0);
                const posB = new THREE.Vector3(
                    (Math.random() - 0.5) * 10,
                    PORTAL_HEIGHT / 2,
                    (Math.random() - 0.5) * 10 + 5
                );
                const rotB = new THREE.Euler(0, Math.random() * Math.PI * 2, 0);
                this.createPortalPair(posA, rotA, posB, rotB);
            },
            maxRecursion: this.maxRecursionDepth,
        };
        portalFolder.add(params, 'addPair').name('Add Portal Pair');
        portalFolder.add(params, 'maxRecursion', 0, 5).step(1).name('Max Recursion Depth')
            .onChange(val => this.maxRecursionDepth = val);
        // portalFolder.open();
        return portalFolder;
    }
}
