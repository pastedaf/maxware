export class CameraManager {
    constructor(width = 64, height = 48) {
        this.videoElement = document.createElement('video');
        this.videoElement.id = 'webcamFeed';
        this.videoElement.setAttribute('playsinline', ''); // Important for mobile iOS
        this.videoElement.setAttribute('autoplay', '');
        this.videoElement.style.display = 'none'; // Keep it hidden
        document.body.appendChild(this.videoElement); // Needs to be in DOM for some browsers

        this.width = width;
        this.height = height;

        this.currentFrameCanvas = document.createElement('canvas');
        this.currentFrameCanvas.width = this.width;
        this.currentFrameCanvas.height = this.height;
        this.currentFrameCtx = this.currentFrameCanvas.getContext('2d', { willReadFrequently: true });


        this.lastFrameCanvas = document.createElement('canvas');
        this.lastFrameCanvas.width = this.width;
        this.lastFrameCanvas.height = this.height;
        this.lastFrameCtx = this.lastFrameCanvas.getContext('2d', { willReadFrequently: true });

        this.stream = null;
        this.lastMotionScore = 0;
        this.isInitialized = false;
        this.isRunning = false;
    }

    async initCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error('getUserMedia is not supported in this browser.');
            alert('Camera access (getUserMedia) is not supported in this browser.');
            this.isInitialized = false;
            return false;
        }

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: this.width },
                    height: { ideal: this.height },
                    facingMode: 'user' // Prefer front camera
                },
                audio: false // We only need video for motion
            });
            this.videoElement.srcObject = this.stream;
            await this.videoElement.play(); // Ensure video starts playing
            this.isInitialized = true;
            console.log("Camera initialized successfully.");
            return true;
        } catch (error) {
            console.error("Error accessing camera:", error);
            alert(`Error accessing camera: ${error.name}. Please ensure permission is granted and no other app is using the camera.`);
            this.isInitialized = false;
            this.stream = null; // Ensure stream is null on error
            return false;
        }
    }

    start() {
         if (!this.isInitialized && !this.stream) {
             console.warn("Camera not initialized. Cannot start.");
             // Optionally try to initialize here:
             // await this.initCamera();
             // if (!this.isInitialized) return;
             return;
         }
         if (this.isRunning) return;

         // Ensure video is playing if stream exists
         if (this.videoElement.paused && this.stream) {
            this.videoElement.play().catch(e => console.error("Error restarting video:", e));
         }

         this.isRunning = true;
         console.log("Camera processing started.");
         // Initialize last frame
         this.currentFrameCtx.drawImage(this.videoElement, 0, 0, this.width, this.height);
         this.lastFrameCtx.drawImage(this.currentFrameCanvas, 0, 0, this.width, this.height);
    }

    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        console.log("Camera processing stopped.");
        // Don't stop the stream tracks here, just pause processing.
        // The stream itself might be stopped externally if needed.
        // this.videoElement.pause(); // Pause video playback
    }

    stopStream() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            console.log("Camera stream stopped.");
            this.stream = null;
            this.videoElement.srcObject = null;
            this.isInitialized = false;
            this.isRunning = false;
        }
    }

    processFrame() {
        if (!this.isRunning || !this.isInitialized || this.videoElement.readyState < this.videoElement.HAVE_CURRENT_DATA) {
            this.lastMotionScore = 0; // No motion if not running or ready
            return;
        }

        // Draw current video frame to current canvas
        this.currentFrameCtx.drawImage(this.videoElement, 0, 0, this.width, this.height);

        // Get image data
        const currentImageData = this.currentFrameCtx.getImageData(0, 0, this.width, this.height);
        const lastImageData = this.lastFrameCtx.getImageData(0, 0, this.width, this.height);

        const data1 = currentImageData.data;
        const data2 = lastImageData.data;
        let diff = 0;
        const pixelCount = this.width * this.height;

        // Simple pixel difference calculation (grayscale)
        for (let i = 0; i < data1.length; i += 4) {
            // Basic grayscale conversion (average) - could use luminance weights for better results
            const gray1 = (data1[i] + data1[i + 1] + data1[i + 2]) / 3;
            const gray2 = (data2[i] + data2[i + 1] + data2[i + 2]) / 3;
            diff += Math.abs(gray1 - gray2);
        }

        // Update last frame canvas for the next comparison
        this.lastFrameCtx.drawImage(this.currentFrameCanvas, 0, 0, this.width, this.height);

        // Normalize the difference score
        // Max difference per pixel is 255. Max total diff is pixelCount * 255.
        const maxDiff = pixelCount * 255;
        this.lastMotionScore = maxDiff > 0 ? diff / maxDiff : 0;

        // Optional: Apply some smoothing or thresholding
        // this.lastMotionScore = Math.pow(this.lastMotionScore, 2); // Emphasize larger changes
        this.lastMotionScore = Math.min(this.lastMotionScore * 10, 1.0); // Amplify smaller changes, clamp
    }

    getMotionScore() {
        // Call processFrame implicitly when getting the score
        this.processFrame();
        return this.lastMotionScore;
    }

    getVideoElement() {
        return this.videoElement;
    }
}
