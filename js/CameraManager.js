export class CameraManager {
    constructor(videoElementId, width = 64, height = 48) {
        this.videoElement = document.getElementById(videoElementId);
        if (!this.videoElement) {
            console.error(`CameraManager Error: Video element with ID "${videoElementId}" not found.`);
            // Create one dynamically as a fallback? Or throw error?
            // For now, let's log the error and proceed, but it will likely fail later.
            this.videoElement = document.createElement('video'); // Fallback, might not work well
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
            // Wait for metadata to ensure dimensions are available
            await new Promise((resolve, reject) => {
                this.videoElement.onloadedmetadata = () => {
                    this.updateCanvasDimensions(this.videoElement.videoWidth, this.videoElement.videoHeight);
                    resolve();
                };
                this.videoElement.onerror = (e) => reject(new Error("Error loading webcam video metadata."));
                // Start playing to trigger metadata loading
                 this.videoElement.play().catch(e => {
                     // Play might fail due to autoplay policies, but metadata might still load
                     console.warn("Webcam play() call initially failed (may resolve on user interaction):", e);
                     // Don't reject here, let onloadedmetadata handle success
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
            this.videoElement.muted = false; // Allow video file audio (though we don't use it)
            this.videoElement.loop = true; // Loop video files

            // Wait for metadata
            await new Promise((resolve, reject) => {
                this.videoElement.onloadedmetadata = () => {
                    this.updateCanvasDimensions(this.videoElement.videoWidth, this.videoElement.videoHeight);
                    resolve();
                };
                 this.videoElement.onerror = (e) => {
                     console.error("Error loading video meta", e);
                     reject(new Error(`Error loading video file meta ${file.name}`));
                 };
                 // Load initiates metadata loading for file sources
                 this.videoElement.load();
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
             return;
         }
         if (this.isRunning) {
             // console.log("CameraManager: Processing already running.");
             return;
         }

         // Ensure video element is playing
         if (this.videoElement.paused) {
            this.videoElement.play().then(() => {
                console.log(`CameraManager: Playback started for ${this.sourceType}.`);
                this.isRunning = true;
                console.log("CameraManager: Processing started.");
                // Initialize last frame *after* playback starts successfully
                // Use a short delay to ensure the first frame is drawn correctly
                setTimeout(() => {
                    if (!this.isRunning) return; // Check if stopped again quickly
                    try {
                        this.currentFrameCtx.drawImage(this.videoElement, 0, 0, this.currentFrameCanvas.width, this.currentFrameCanvas.height);
                        this.lastFrameCtx.drawImage(this.currentFrameCanvas, 0, 0, this.currentFrameCanvas.width, this.currentFrameCanvas.height);
                        console.log("CameraManager: Initial frame captured for diffing.");
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
            });
         } else {
             // Already playing, just start the processing flag
             this.isRunning = true;
             console.log("CameraManager: Processing started (playback was already active).");
             // Capture initial frame immediately if already playing
             try {
                 this.currentFrameCtx.drawImage(this.videoElement, 0, 0, this.currentFrameCanvas.width, this.currentFrameCanvas.height);
                 this.lastFrameCtx.drawImage(this.currentFrameCanvas, 0, 0, this.currentFrameCanvas.width, this.currentFrameCanvas.height);
             } catch (e) {
                  console.error("CameraManager: Error capturing initial frame (already playing):", e);
             }
         }
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
        this.videoElement.pause();
        this.videoElement.srcObject = null;
        this.videoElement.src = '';
        // Reset event listeners to prevent memory leaks if needed, though assigning null sources often suffices
        this.videoElement.onloadedmetadata = null;
        this.videoElement.onerror = null;


        this.stream = null;
        this.videoObjectURL = null;
        this.isInitialized = false;
        this.sourceType = 'none';
        this.lastMotionScore = 0;

        // Optionally reset canvas? Or keep last frame? Let's clear it.
        // this.currentFrameCtx.clearRect(0, 0, this.currentFrameCanvas.width, this.currentFrameCanvas.height);
        // this.lastFrameCtx.clearRect(0, 0, this.lastFrameCanvas.width, this.lastFrameCanvas.height);
    }

    // Processes a single frame for motion detection or visualization data
    processFrame() {
        // Only process if running, initialized, and video has data
        if (!this.isRunning || !this.isInitialized || this.videoElement.readyState < this.videoElement.HAVE_CURRENT_DATA || this.videoElement.videoWidth === 0) {
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
            } else {
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
