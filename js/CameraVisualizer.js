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
            // Add transform defaults
            position: options.position || new THREE.Vector3(0, 0, -5), // Default position slightly back
            rotation: options.rotation || new THREE.Euler(0, 0, 0),
            scale: options.scale || new THREE.Vector3(1, 1, 1),
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
        // Adjust plane height based on aspect ratio to maintain proportions
        const planeWidth = this.options.visualScale;
        const planeHeight = this.options.visualScale / aspectRatio;
        const halfWidth = planeWidth / 2;
        const halfHeight = planeHeight / 2;


        let k = 0;
        for (let i = 0; i < this.options.widthSegments; i++) {
            for (let j = 0; j < this.options.heightSegments; j++) {
                const u = i / (this.options.widthSegments - 1); // Normalized 0-1
                const v = j / (this.options.heightSegments - 1); // Normalized 0-1

                // Place particles on XY plane relative to the object's origin
                const x = u * planeWidth - halfWidth;
                const y = v * planeHeight - halfHeight; // Use Y for vertical position on the plane
                const z = 0; // Initial Z depth relative to object origin

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

        // Apply initial transform from options
        this.points.position.copy(this.options.position);
        this.points.rotation.copy(this.options.rotation);
        this.points.scale.copy(this.options.scale);

        this.points.visible = this.options.visible;

        this.scene.add(this.points);
        this.isInitialized = true;
        console.log("CameraVisualizer initialized.");
    }

    // Helper method to safely get the points object
    getPointsObject() {
        return this.points;
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
        let imageData;
        try {
             imageData = ctx.getImageData(0, 0, videoWidth, videoHeight);
        } catch (e) {
             console.warn("CameraVisualizer: Failed to getImageData (canvas might be tainted or size 0).", e);
             if (this.points) this.points.visible = false; // Hide if we can't get data
             return;
        }
        const data = imageData.data;

        const positions = this.geometry.attributes.position.array;
        const colors = this.geometry.attributes.color.array;

        let k = 0;
        for (let i = 0; i < this.options.widthSegments; i++) {
            for (let j = 0; j < this.options.heightSegments; j++) {
                // Map particle grid coordinates (u, v) to video texture coordinates
                const u = i / (this.options.widthSegments - 1);
                // Flip V for image coords (0,0 is top-left in canvas, but often bottom-left in textures)
                // Particle Y increases upwards, so sample image Y downwards.
                const v = 1.0 - (j / (this.options.heightSegments - 1));

                // Calculate corresponding pixel index in the ImageData
                const sampleX = Math.floor(u * (videoWidth - 1));
                const sampleY = Math.floor(v * (videoHeight - 1));
                const pixelIndex = (sampleY * videoWidth + sampleX) * 4; // 4 components (R, G, B, A)

                // Check bounds for safety
                if (pixelIndex < 0 || pixelIndex + 3 >= data.length) {
                    continue; // Skip if index is out of bounds
                }

                // Sample color components
                const r = data[pixelIndex] / 255.0;     // Normalize to 0-1
                const g = data[pixelIndex + 1] / 255.0;
                const b = data[pixelIndex + 2] / 255.0;

                // Calculate brightness (average of R, G, B)
                const brightness = (r + g + b) / 3;

                // Update Z position based on brightness (relative to particle plane)
                // We access the array directly for performance
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
        }
        // Visibility of the points object itself is handled by the update loop
        // based on whether it *can* update.
        // We just need to ensure init() is called if needed.

         // If turning visible, trigger an immediate update if possible (conditions allowing)
         if (visible && this.isInitialized) {
             this.update();
         } else if (!visible && this.points) {
             // Explicitly hide if set to invisible
             this.points.visible = false;
         }
    }

    setDepthScale(scale) {
        this.options.depthScale = scale;
        // Store in options as well if needed for persistence/reset
        if (this.points) this.options.position.copy(this.points.position);
    }

    setPosition(x, y, z) {
        if (this.points) {
            this.points.position.set(x, y, z);
            // Store in options as well if needed for persistence/reset
            this.options.position.copy(this.points.position);
        }
    }

    setRotation(xRad, yRad, zRad) {
        if (this.points) {
            this.points.rotation.set(xRad, yRad, zRad);
             // Store in options as well if needed for persistence/reset
            this.options.rotation.copy(this.points.rotation);
        }
    }

    setScale(x, y, z) {
        if (this.points) {
            this.points.scale.set(x, y, z);
             // Store in options as well if needed for persistence/reset
            this.options.scale.copy(this.points.scale);
        }
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
             if (this.options.visible && this.isInitialized) {
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
        this.points = null; // Clear reference
        this.isInitialized = false;
        console.log("CameraVisualizer disposed.");
    }
}
