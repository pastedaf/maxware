export class CameraManager {
    constructor(videoElementId, width = 64, height = 48) {
        this.videoElement = document.getElementById(videoElementId);
        if (!this.videoElement) {
            console.error(`CameraManager Error: Video element with ID "${videoElementId}" not found.`);
            // Create one dynamically as a fallback? Or throw error?
            // For now, let's log the error and proceed, but it will likely fail later.
            this.videoElement = document.createElement('video'); // Fallback, might not work well
            this.videoElement.id = videoElementId; // Assign ID if created dynamically
            document.body.appendChild(this.videoElement); // Append to body to make it potentially usable
            this.videoElement.style.display = 'none'; // Keep it hidden
            console.warn(`CameraManager: Created fallback video element with ID "${videoElementId}".`);
        }

        // Ensure necessary video attributes are set
        this.videoElement.setAttribute('playsinline', ''); // Important for mobile iOS
        // Autoplay and muted are controlled dynamically based on source type

        this.requestedWidth = width;  // Requested/default processing width
        this.requestedHeight = height; // Requested/default processing height

        // Canvas dimensions will be updated based on actual video source dimensions
        this.currentFrameCanvas = document.createElement('canvas');
        this.currentFrameCtx = this.currentFrameCanvas.getContext('2d', { willReadFrequently: true });

        this.lastFrameCanvas = document.createElement('canvas');
        this.lastFrameCtx = this.lastFrameCanvas.getContext('2d', { willReadFrequently: true });

        this.stream = null; // Holds the webcam MediaStream
        this.videoObjectURL = null; // Holds the URL for video files
        this.sourceType = 'none'; // 'none', 'webcam', 'video'
        this.lastMotionScore = 0;
        this.isInitialized = false; // Indicates if a source (webcam or video) is loaded and ready
        this.isRunning = false; // Indicates if processing loop (getMotionScore/processFrame) is active

        // Initial canvas setup (will be resized)
        this.updateCanvasDimensions(this.requestedWidth, this.requestedHeight);
    }

    // Helper to update internal canvas sizes
    updateCanvasDimensions(width, height) {
        // Ensure width and height are valid numbers > 0
        width = Math.max(1, Math.floor(width));
        height = Math.max(1, Math.floor(height));

        if (this.currentFrameCanvas.width !== width || this.currentFrameCanvas.height !== height) {
            this.currentFrameCanvas.width = width;
            this.currentFrameCanvas.height = height;
            this.lastFrameCanvas.width = width;
            this.lastFrameCanvas.height = height;
            console.log(`CameraManager: Canvas dimensions updated to ${width}x${height}`);
        }
    }

    // Initializes the WEBCAM stream
    async initCamera() {
        console.log("Attempting to initialize webcam...");
        this.resetSource(); // Stop and clear any previous source first

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error('getUserMedia is not supported in this browser.');
            alert('Camera access (getUserMedia) is not supported in this browser.');
            this.isInitialized = false;
            return false;
        }

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: this.requestedWidth },
                    height: { ideal: this.requestedHeight },
                    facingMode: 'user' // Prefer front camera
                },
                audio: false
            });

            this.videoElement.srcObject = this.stream;
            this.videoElement.muted = true; // Mute webcam audio by default
            this.videoElement.loop = false; // No loop for webcam stream
            this.videoElement.autoplay = true; // Try to autoplay webcam

            // Wait for metadata to ensure dimensions are available
            await new Promise((resolve, reject) => {
                this.videoElement.onloadedmetadata = () => {
                    // Check for valid dimensions before updating canvas
                    if (this.videoElement.videoWidth > 0 && this.videoElement.videoHeight > 0) {
                        this.updateCanvasDimensions(this.videoElement.videoWidth, this.videoElement.videoHeight);
                        resolve();
                    } else {
                        // This can happen if the stream ends abruptly or metadata is incomplete
                        console.warn("Webcam loaded metadata but dimensions are invalid (0).");
                        // Don't resolve yet, wait for playing or error
                    }
                };
                this.videoElement.onerror = (e) => reject(new Error("Error loading webcam video metadata."));

                // Use 'playing' event as a more reliable indicator that dimensions are ready
                this.videoElement.onplaying = () => {
                     if (this.videoElement.videoWidth > 0 && this.videoElement.videoHeight > 0) {
                         this.updateCanvasDimensions(this.videoElement.videoWidth, this.videoElement.videoHeight);
                         resolve(); // Resolve promise once playing starts and dimensions are valid
                     } else {
                         console.warn("Webcam started playing but dimensions are invalid (0).");
                         // Consider rejecting or handling this case
                     }
                };

                // Start playing to trigger metadata loading and playing event
                 this.videoElement.play().catch(e => {
                     // Play might fail due to autoplay policies, but metadata might still load
                     console.warn("Webcam play() call initially failed (may resolve on user interaction):", e);
                     // Don't reject here, let onloadedmetadata or onplaying handle success
                 });
            });

            this.isInitialized = true;
            this.sourceType = 'webcam';
            console.log(`Webcam initialized successfully (${this.videoElement.videoWidth}x${this.videoElement.videoHeight}).`);
            return true;

        } catch (error) {
            console.error("Error accessing camera:", error);
            alert(`Error accessing camera: ${error.name}. Please ensure permission is granted and no other app is using the camera.`);
            this.resetSource(); // Clean up on error
            return false;
        }
    }

    // Loads a VIDEO FILE
    async loadVideo(file) {
        console.log(`Attempting to load video file: ${file.name}`);
        this.resetSource(); // Stop and clear any previous source first

        try {
            this.videoObjectURL = URL.createObjectURL(file);
            this.videoElement.src = this.videoObjectURL;
            this.videoElement.muted = false; // Allow video file audio (though we don't use it for processing)
            this.videoElement.loop = true; // Loop video files
            this.videoElement.autoplay = false; // Don't autoplay video files, wait for start()

            // Wait for metadata
            await new Promise((resolve, reject) => {
                this.videoElement.onloadedmetadata = () => {
                     if (this.videoElement.videoWidth > 0 && this.videoElement.videoHeight > 0) {
                        this.updateCanvasDimensions(this.videoElement.videoWidth, this.videoElement.videoHeight);
                        resolve();
                    } else {
                        console.warn("Video file loaded metadata but dimensions are invalid (0).");
                        reject(new Error(`Video file "${file.name}" has invalid dimensions.`));
                    }
                };
                 this.videoElement.onerror = (e) => {
                     console.error("Error loading video meta", e);
                     reject(new Error(`Error loading video file meta ${file.name}`));
                 };
                 // Load initiates metadata loading for file sources
                 this.videoElement.load(); // Important for file sources
            });

            this.isInitialized = true;
            this.sourceType = 'video';
            console.log(`Video file "${file.name}" loaded successfully (${this.videoElement.videoWidth}x${this.videoElement.videoHeight}).`);
            // Don't auto-play here, let start() handle it
            return true;

        } catch (error) {
            console.error(`Error loading video file "${file.name}":`, error);
            alert(`Error loading video file: ${error.message}`);
            this.resetSource(); // Clean up on error
            return false;
        }
    }


    // Starts the processing loop AND ensures the video/stream is playing
    start() {
         if (!this.isInitialized) {
             console.warn("CameraManager: Source not initialized. Cannot start.");
             return false; // Indicate failure
         }
         if (this.isRunning) {
             // console.log("CameraManager: Processing already running.");
             return true; // Indicate already running (success)
         }

         // Ensure video element is playing
         if (this.videoElement.paused) {
            const playPromise = this.videoElement.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log(`CameraManager: Playback started for ${this.sourceType}.`);
                    this.isRunning = true;
                    console.log("CameraManager: Processing started.");
                    // Initialize last frame *after* playback starts successfully
                    // Use a short delay to ensure the first frame is drawn correctly
                    setTimeout(() => {
                        if (!this.isRunning) return; // Check if stopped again quickly
                        try {
                            // Ensure dimensions are valid before drawing
                            if (this.currentFrameCanvas.width > 0 && this.currentFrameCanvas.height > 0) {
                                this.currentFrameCtx.drawImage(this.videoElement, 0, 0, this.currentFrameCanvas.width, this.currentFrameCanvas.height);
                                this.lastFrameCtx.drawImage(this.currentFrameCanvas, 0, 0, this.currentFrameCanvas.width, this.currentFrameCanvas.height);
                                console.log("CameraManager: Initial frame captured for diffing.");
                            } else {
                                console.warn("CameraManager: Cannot capture initial frame, canvas dimensions invalid.");
                            }
                        } catch (e) {
                            console.error("CameraManager: Error capturing initial frame:", e);
                            // Potentially stop running if frame capture fails critically
                            // this.stop();
                        }
                    }, 100); // 100ms delay, adjust if needed

                }).catch(e => {
                    console.error(`CameraManager: Error starting playback for ${this.sourceType}:`, e);
                    // Don't set isRunning true if play fails
                    alert(`Could not start video playback. Error: ${e.name}. Try interacting with the page first.`);
                    this.isRunning = false; // Ensure isRunning is false on error
                });
            } else {
                // If play() doesn't return a promise (older browsers?), assume sync success/failure? Risky.
                // Or rely on events like 'playing'. For simplicity, let's assume modern browsers.
                console.warn("CameraManager: videoElement.play() did not return a promise.");
                // We might be running, or not. Let's assume not for safety.
                this.isRunning = false;
                return false; // Indicate potential failure
            }
         } else {
             // Already playing, just start the processing flag
             this.isRunning = true;
             console.log("CameraManager: Processing started (playback was already active).");
             // Capture initial frame immediately if already playing
             try {
                  if (this.currentFrameCanvas.width > 0 && this.currentFrameCanvas.height > 0) {
                     this.currentFrameCtx.drawImage(this.videoElement, 0, 0, this.currentFrameCanvas.width, this.currentFrameCanvas.height);
                     this.lastFrameCtx.drawImage(this.currentFrameCanvas, 0, 0, this.currentFrameCanvas.width, this.currentFrameCanvas.height);
                 } else {
                      console.warn("CameraManager: Cannot capture initial frame (already playing), canvas dimensions invalid.");
                 }
             } catch (e) {
                  console.error("CameraManager: Error capturing initial frame (already playing):", e);
             }
         }
         return true; // Indicate success or already running
    }

    // Stops ONLY the processing loop flag
    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        console.log("CameraManager: Processing stopped.");
        // We don't pause the video here - let the controlling logic decide
        // whether to pause or fully reset the source.
        // this.videoElement.pause();
    }

    // Stops the current source (webcam or video) and resets state
    resetSource() {
        console.log(`CameraManager: Resetting source (was ${this.sourceType}).`);
        this.stop(); // Ensure processing flag is off

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            console.log("CameraManager: Webcam stream tracks stopped.");
        }
        if (this.videoObjectURL) {
            URL.revokeObjectURL(this.videoObjectURL);
            console.log("CameraManager: Video object URL revoked.");
        }

        // Pause and clear video element sources
        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.srcObject = null;
            this.videoElement.src = '';
            // Detach event listeners to prevent memory leaks
            this.videoElement.onloadedmetadata = null;
            this.videoElement.onerror = null;
            this.videoElement.onplaying = null; // Make sure to clear this too
            // Reset attributes that might interfere
            this.videoElement.removeAttribute('autoplay');
            this.videoElement.removeAttribute('loop');
            this.videoElement.removeAttribute('muted');
        }


        this.stream = null;
        this.videoObjectURL = null;
        this.isInitialized = false;
        this.sourceType = 'none';
        this.lastMotionScore = 0;

        // Optionally reset canvas? Or keep last frame? Let's clear it.
        // Check if context exists before clearing
        // if (this.currentFrameCtx) {
        //     this.currentFrameCtx.clearRect(0, 0, this.currentFrameCanvas.width, this.currentFrameCanvas.height);
        // }
        // if (this.lastFrameCtx) {
        //     this.lastFrameCtx.clearRect(0, 0, this.lastFrameCanvas.width, this.lastFrameCanvas.height);
        // }
    }

    // Processes a single frame for motion detection or visualization data
    processFrame() {
        // Only process if running, initialized, and video has data and valid dimensions
        if (!this.isRunning || !this.isInitialized || !this.videoElement || this.videoElement.readyState < this.videoElement.HAVE_CURRENT_DATA || this.videoElement.videoWidth <= 0 || this.videoElement.videoHeight <= 0 || this.currentFrameCanvas.width <= 0 || this.currentFrameCanvas.height <= 0) {
            // Don't reset motion score here, let getMotionScore return the last valid one or 0
            // this.lastMotionScore = 0;
            return;
        }

        try {
            // Draw current video frame to current canvas
            this.currentFrameCtx.drawImage(this.videoElement, 0, 0, this.currentFrameCanvas.width, this.currentFrameCanvas.height);

            // Get image data for diffing
            const currentImageData = this.currentFrameCtx.getImageData(0, 0, this.currentFrameCanvas.width, this.currentFrameCanvas.height);
            const lastImageData = this.lastFrameCtx.getImageData(0, 0, this.lastFrameCanvas.width, this.lastFrameCanvas.height);

            const data1 = currentImageData.data;
            const data2 = lastImageData.data;
            let diff = 0;
            const pixelCount = this.currentFrameCanvas.width * this.currentFrameCanvas.height;

            // Simple pixel difference calculation (grayscale average)
            for (let i = 0; i < data1.length; i += 4) {
                // Check if pixel data exists (might not if canvas is tiny)
                if (i + 2 >= data1.length || i + 2 >= data2.length) break;

                const gray1 = (data1[i] + data1[i + 1] + data1[i + 2]) / 3;
                const gray2 = (data2[i] + data2[i + 1] + data2[i + 2]) / 3;
                diff += Math.abs(gray1 - gray2);
            }

            // Update last frame canvas for the next comparison *after* calculating diff
            this.lastFrameCtx.drawImage(this.currentFrameCanvas, 0, 0, this.currentFrameCanvas.width, this.currentFrameCanvas.height);

            // Normalize the difference score
            const maxDiff = pixelCount * 255;
            this.lastMotionScore = maxDiff > 0 ? diff / maxDiff : 0;

            // Amplify smaller changes and clamp
            this.lastMotionScore = Math.min(this.lastMotionScore * 10, 1.0);

        } catch (e) {
            // Ignore potential SecurityError if canvas becomes tainted (e.g., cross-origin video without CORS)
            // Or errors if video dimensions suddenly become 0
            if (e.name === 'SecurityError') {
                console.warn("CameraManager: Canvas tainted, cannot process frame for motion detection.");
                this.lastMotionScore = 0; // Reset score if we can't process
                // Consider stopping processing if this error persists?
                this.stop(); // Stop processing if we hit a security error
            } else if (e instanceof DOMException && e.name === 'InvalidStateError') {
                 console.warn("CameraManager: InvalidStateError during frame processing (video dimensions might be 0). Skipping frame.");
                 this.lastMotionScore = 0; // Reset score
            }
             else {
                console.error("CameraManager: Error processing frame:", e);
                this.lastMotionScore = 0; // Reset score on other errors
            }
        }
    }

    // Gets the motion score, implicitly processing the frame first
    getMotionScore() {
        // Process the frame to update lastMotionScore
        this.processFrame();
        // Return the calculated score (or the last valid one if processing failed)
        return this.lastMotionScore;
    }

    getVideoElement() {
        return this.videoElement;
    }

    // Optional: Explicit cleanup method
    dispose() {
        console.log("Disposing CameraManager...");
        this.resetSource();
        // Remove the video element if it was added by this manager?
        // Assuming the element exists in HTML, we don't remove it here.
        // If created dynamically, add:
        // if (this.videoElement && this.videoElement.parentElement) {
        //     this.videoElement.parentElement.removeChild(this.videoElement);
        // }
    }
}
