import * as THREE from 'three';

export class CameraVisualizer {
    constructor(scene, cameraManager, options = {}) {
        this.scene = scene;
        this.cameraManager = cameraManager;

        // Default options
        this.options = {
            widthSegments: options.widthSegments || 64, // Match camera aspect ratio if possible
            heightSegments: options.heightSegments || 48,
            particleSize: options.particleSize || 0.1,
            depthScale: options.depthScale || 5.0, // How much brightness affects Z position
            visualScale: options.visualScale || 15, // Size of the particle plane in the scene
            visible: options.visible || false,
            colorMode: options.colorMode || 'brightness', // 'brightness' or 'color'
        };

        this.geometry = null;
        this.material = null;
        this.points = null;
        this.isInitialized = false;

        if (this.options.visible) {
            this.init();
        }
    }

    init() {
        if (this.isInitialized) return;

        const numParticles = this.options.widthSegments * this.options.heightSegments;
        this.geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(numParticles * 3);
        const colors = new Float32Array(numParticles * 3);

        const aspectRatio = this.options.widthSegments / this.options.heightSegments;
        const planeHeight = this.options.visualScale / aspectRatio;
        const halfWidth = this.options.visualScale / 2;
        const halfHeight = planeHeight / 2;

        let k = 0;
        for (let i = 0; i < this.options.widthSegments; i++) {
            for (let j = 0; j < this.options.heightSegments; j++) {
                const u = i / (this.options.widthSegments - 1); // Normalized 0-1
                const v = j / (this.options.heightSegments - 1); // Normalized 0-1

                const x = u * this.options.visualScale - halfWidth;
                const y = v * planeHeight - halfHeight; // Use Y for vertical position on the plane
                const z = 0; // Initial Z depth

                positions[k * 3] = x;
                positions[k * 3 + 1] = y;
                positions[k * 3 + 2] = z;

                colors[k * 3] = 1; // Initial white
                colors[k * 3 + 1] = 1;
                colors[k * 3 + 2] = 1;

                k++;
            }
        }

        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        this.material = new THREE.PointsMaterial({
            size: this.options.particleSize,
            vertexColors: true,
            sizeAttenuation: true, // Adjust size based on distance
            // Optional: Add blending for softer look
            // blending: THREE.AdditiveBlending,
            // transparent: true,
            // depthWrite: false,
        });

        this.points = new THREE.Points(this.geometry, this.material);
        this.points.visible = this.options.visible;
        // Optional: Rotate if needed to face the camera or align with grids
        // this.points.rotation.x = -Math.PI / 2; // Example: Lay flat on XZ plane

        this.scene.add(this.points);
        this.isInitialized = true;
        console.log("CameraVisualizer initialized.");
    }

    update() {
        // Check if ready to update
        const canUpdate = this.isInitialized &&
                          this.options.visible &&
                          this.cameraManager.isRunning &&
                          this.cameraManager.isInitialized &&
                          this.cameraManager.videoElement.readyState >= this.cameraManager.videoElement.HAVE_METADATA &&
                          this.cameraManager.currentFrameCanvas.width > 0 &&
                          this.cameraManager.currentFrameCanvas.height > 0;


        if (!canUpdate) {
            // Ensure points are hidden if conditions aren't met
            if (this.points && this.points.visible) {
                 this.points.visible = false;
            }
            return;
        }

        // Ensure points are visible if they should be
        if (this.points && !this.points.visible) {
            this.points.visible = true;
        }

        // Access the canvas and context used in CameraManager's processFrame
        const ctx = this.cameraManager.currentFrameCtx;
        const canvas = ctx.canvas;
        const videoWidth = canvas.width;
        const videoHeight = canvas.height;

        // Get image data (already drawn in CameraManager.processFrame)
        const imageData = ctx.getImageData(0, 0, videoWidth, videoHeight);
        const data = imageData.data;

        const positions = this.geometry.attributes.position.array;
        const colors = this.geometry.attributes.color.array;

        let k = 0;
        for (let i = 0; i < this.options.widthSegments; i++) {
            for (let j = 0; j < this.options.heightSegments; j++) {
                // Map particle grid coordinates (u, v) to video texture coordinates
                const u = i / (this.options.widthSegments - 1);
                // Flip V for image coords (0,0 is top-left in canvas, but often bottom-left in textures)
                // Let's keep particle Y increasing upwards, so sample image Y downwards.
                const v = 1.0 - (j / (this.options.heightSegments - 1));

                // Calculate corresponding pixel index in the ImageData
                const sampleX = Math.floor(u * (videoWidth - 1));
                const sampleY = Math.floor(v * (videoHeight - 1));
                const pixelIndex = (sampleY * videoWidth + sampleX) * 4; // 4 components (R, G, B, A)

                // Sample color components
                const r = data[pixelIndex] / 255.0;     // Normalize to 0-1
                const g = data[pixelIndex + 1] / 255.0;
                const b = data[pixelIndex + 2] / 255.0;

                // Calculate brightness (average of R, G, B)
                const brightness = (r + g + b) / 3;

                // Update Z position based on brightness (always, regardless of color mode)
                positions[k * 3 + 2] = brightness * this.options.depthScale;

                // Update color based on selected mode
                if (this.options.colorMode === 'color') {
                    colors[k * 3] = r;
                    colors[k * 3 + 1] = g;
                    colors[k * 3 + 2] = b;
                } else { // 'brightness' mode
                    colors[k * 3] = brightness;
                    colors[k * 3 + 1] = brightness;
                    colors[k * 3 + 2] = brightness;
                }

                k++;
            }
        }

        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
    }

    setVisible(visible) {
        this.options.visible = visible;
        if (visible && !this.isInitialized) {
            this.init(); // Initialize if set visible for the first time
        } else if (this.points) {
            // Visibility will be handled by the update loop based on conditions
            // this.points.visible = visible; // Let update() manage visibility based on readiness
        }
         // If turning visible, trigger an immediate update if possible (conditions allowing)
         if (visible && this.isInitialized) {
             this.update();
         }
    }

    setDepthScale(scale) {
        this.options.depthScale = scale;
    }

     setParticleSize(size) {
         this.options.particleSize = size;
         if (this.material) {
             this.material.size = size;
             this.material.needsUpdate = true; // Not strictly necessary for size, but good practice
         }
     }

     setColorMode(mode) {
         if (mode === 'brightness' || mode === 'color') {
             this.options.colorMode = mode;
             // Trigger an update to reflect the change immediately if visible
             if (this.options.visible) {
                 this.update();
             }
         } else {
             console.warn(`CameraVisualizer: Invalid color mode "${mode}". Use 'brightness' or 'color'.`);
         }
     }

    // TODO: Add method to update particle count (requires recreating geometry/points)

    dispose() {
        if (this.points) {
            this.scene.remove(this.points);
        }
        if (this.geometry) {
            this.geometry.dispose();
        }
        if (this.material) {
            this.material.dispose();
        }
        this.isInitialized = false;
        console.log("CameraVisualizer disposed.");
    }
}
