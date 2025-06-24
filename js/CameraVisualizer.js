import * as THREE from 'three';

export class CameraVisualizer {
    constructor(scene, cameraManager, audioManager, options = {}) { // Added audioManager
        this.scene = scene;
        this.cameraManager = cameraManager;
        this.audioManager = audioManager; // Store audioManager

        // Default options
        this.options = {
            widthSegments: options.widthSegments || 64, // Match camera aspect ratio if possible
            heightSegments: options.heightSegments || 48,
            particleSize: options.particleSize || 0.1,
            depthScale: options.depthScale || 5.0, // How much brightness affects Z position
            visualScale: options.visualScale || 15, // Size of the particle plane in the scene
            visible: options.visible || false,
            colorMode: options.colorMode || 'brightness', // 'brightness', 'color', 'fftLow', 'fftMid', 'fftHigh', 'fftSpectrum'
            particleFadeSpeed: 0.0, // 0 = no fade, > 0 = fade speed
            particleRandomMotion: 0.0, // 0 = no random motion, > 0 = motion intensity
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

    update(deltaTime = 0.016) { // Accept deltaTime, provide a fallback
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
        // deltaTime is now passed as an argument

        // Get FFT data if needed for current color mode
        let lowAmp = 0, midAmp = 0, highAmp = 0;
        const cm = this.options.colorMode;
        if (cm === 'fftLow' || cm === 'fftMid' || cm === 'fftHigh' || cm === 'fftSpectrum') {
            if (this.audioManager && this.audioManager.audioContext) {
                lowAmp = this.audioManager.getAverageAmplitude('low') / 255; // Normalize 0-1
                midAmp = this.audioManager.getAverageAmplitude('mid') / 255;
                highAmp = this.audioManager.getAverageAmplitude('high') / 255;
            }
        }


        let k = 0;
        for (let i = 0; i < this.options.widthSegments; i++) {
            for (let j = 0; j < this.options.heightSegments; j++) {
                const pIndex = k * 3;
                // Map particle grid coordinates (u, v) to video texture coordinates
                const u = i / (this.options.widthSegments - 1);
                const v_img = 1.0 - (j / (this.options.heightSegments - 1)); // Flipped for image sampling

                const sampleX = Math.floor(u * (videoWidth - 1));
                const sampleY = Math.floor(v_img * (videoHeight - 1));
                const pixelIndex = (sampleY * videoWidth + sampleX) * 4;

                if (pixelIndex < 0 || pixelIndex + 3 >= data.length) {
                    k++; continue;
                }

                const r_cam = data[pixelIndex] / 255.0;
                const g_cam = data[pixelIndex + 1] / 255.0;
                const b_cam = data[pixelIndex + 2] / 255.0;
                const brightness = (r_cam + g_cam + b_cam) / 3;

                // --- Particle Position Update (Z + optional random motion) ---
                positions[pIndex + 2] = brightness * this.options.depthScale;

                if (this.options.particleRandomMotion > 0) {
                    const motionStrength = this.options.particleRandomMotion * 0.1; // Scale factor
                    positions[pIndex] += (Math.random() - 0.5) * motionStrength * deltaTime;
                    positions[pIndex + 1] += (Math.random() - 0.5) * motionStrength * deltaTime;
                    // Optional: Add random Z motion too, if desired
                    // positions[pIndex + 2] += (Math.random() - 0.5) * motionStrength * deltaTime * 0.5;
                }


                // --- Particle Color Update ---
                let r_col = brightness, g_col = brightness, b_col = brightness; // Default to brightness

                switch (this.options.colorMode) {
                    case 'color':
                        r_col = r_cam; g_col = g_cam; b_col = b_cam;
                        break;
                    case 'fftLow':
                        r_col = lowAmp; g_col = lowAmp; b_col = lowAmp;
                        break;
                    case 'fftMid':
                        r_col = midAmp; g_col = midAmp; b_col = midAmp;
                        break;
                    case 'fftHigh':
                        r_col = highAmp; g_col = highAmp; b_col = highAmp;
                        break;
                    case 'fftSpectrum':
                        r_col = lowAmp; g_col = midAmp; b_col = highAmp;
                        break;
                    case 'brightness': // Fallthrough, already default
                    default:
                        break;
                }

                // Apply fade
                if (this.options.particleFadeSpeed > 0) {
                    const fadeFactor = Math.max(0, 1.0 - (this.options.particleFadeSpeed * deltaTime));
                    // It's tricky to fade vertex colors directly without alpha or more complex shader.
                    // For simplicity, we'll fade towards black.
                    // A better fade would involve alpha and transparent material, or a custom shader.
                    colors[pIndex] *= fadeFactor;
                    colors[pIndex + 1] *= fadeFactor;
                    colors[pIndex + 2] *= fadeFactor;

                    // Mix with new color (rudimentary, could be improved)
                    const mixFactor = 0.1; // How much new color to introduce
                    colors[pIndex] = colors[pIndex] * (1 - mixFactor) + r_col * mixFactor;
                    colors[pIndex + 1] = colors[pIndex + 1] * (1 - mixFactor) + g_col * mixFactor;
                    colors[pIndex + 2] = colors[pIndex + 2] * (1 - mixFactor) + b_col * mixFactor;

                } else {
                    colors[pIndex] = r_col;
                    colors[pIndex + 1] = g_col;
                    colors[pIndex + 2] = b_col;
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
        // No need to update this.points here, options are source of truth for this property.
        // Visual update happens in the main update() loop.
    }

    setPosition(x, y, z) {
        this.options.position.set(x, y, z);
        if (this.points) {
            this.points.position.set(x, y, z);
        }
    }

    setRotation(xRad, yRad, zRad) {
        this.options.rotation.set(xRad, yRad, zRad);
        if (this.points) {
            this.points.rotation.set(xRad, yRad, zRad);
        }
    }

    setScale(x, y, z) {
        this.options.scale.set(x, y, z);
        if (this.points) {
            this.points.scale.set(x, y, z);
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
         const validModes = ['brightness', 'color', 'fftLow', 'fftMid', 'fftHigh', 'fftSpectrum'];
         if (validModes.includes(mode)) {
             this.options.colorMode = mode;
             // Trigger an update to reflect the change immediately if visible
             if (this.options.visible && this.isInitialized) {
                 this.update();
             }
         } else {
             console.warn(`CameraVisualizer: Invalid color mode "${mode}". Valid modes are: ${validModes.join(', ')}.`);
         }
     }

    setParticleFadeSpeed(speed) {
        this.options.particleFadeSpeed = Math.max(0, speed); // Ensure non-negative
    }

    setParticleRandomMotion(intensity) {
        this.options.particleRandomMotion = Math.max(0, intensity); // Ensure non-negative
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
