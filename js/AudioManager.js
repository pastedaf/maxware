import * as THREE from 'three';

export class AudioManager {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.audioBuffer = null;
        this.sourceNode = null; // Renamed from 'source' to avoid confusion with source type (file/mic)
        this.streamSource = null; // To keep track of the microphone stream source
        this.isPlaying = false;
        this.isMic = false;
        this.frequencyRanges = {
            low: [20, 250],
            mid: [251, 2000],
            high: [2001, 20000]
        };
    }

    async initAudioContext() {
        if (!this.audioContext || this.audioContext.state === 'closed') {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        // Resume context if needed (required after user interaction)
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    async loadAudio(file) {
        await this.initAudioContext();
        this.isMic = false;
        this.stop(); // Stop any previous playback/mic stream

        return new Promise(async (resolve, reject) => {
            try {
                const arrayBuffer = await file.arrayBuffer();
                this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                this.setupAnalyser();
                console.log("Audio loaded successfully");
                resolve();
            } catch (error) {
                console.error("Error loading or decoding audio file:", error);
                alert("Error loading audio file. Please check the console for details.");
                this.audioBuffer = null; // Ensure buffer is null on error
                reject(error);
            }
        });
    }

    async useMicrophone() {
        await this.initAudioContext();
        this.isMic = true;
        this.stop(); // Stop any previous playback

        return new Promise(async (resolve, reject) => {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                alert('getUserMedia is not supported in this browser.');
                reject(new Error('getUserMedia not supported'));
                return;
            }
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.streamSource = this.audioContext.createMediaStreamSource(stream);
                this.setupAnalyser();
                this.streamSource.connect(this.analyser);
                this.isPlaying = true; // Mic is considered 'playing' once connected
                console.log("Microphone connected successfully");
                resolve();
            } catch (error) {
                console.error("Error accessing microphone:", error);
                alert("Error accessing microphone. Please ensure permission is granted.");
                this.streamSource = null;
                this.isPlaying = false;
                reject(error);
            }
        });
    }

    setupAnalyser() {
        if (!this.audioContext) return;
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    }

    play() {
        if (this.isMic || this.isPlaying || !this.audioBuffer || !this.audioContext) {
            if (this.isMic) console.log("Microphone is already active.");
            else if (this.isPlaying) console.log("Audio is already playing.");
            else if (!this.audioBuffer) console.log("No audio buffer loaded to play.");
            else if (!this.audioContext) console.log("Audio context not initialized.");
            return;
        }

        // Ensure context is running
        this.audioContext.resume().then(() => {
            this.sourceNode = this.audioContext.createBufferSource();
            this.sourceNode.buffer = this.audioBuffer;
            this.sourceNode.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination); // Connect analyser to output
            this.sourceNode.loop = true;
            this.sourceNode.start(0);
            this.isPlaying = true;

            this.sourceNode.onended = () => {
                this.isPlaying = false;
            };
        }).catch(e => console.error("Error resuming audio context:", e));
    }

    stop() {
        if (this.sourceNode && this.isPlaying && !this.isMic) {
            this.sourceNode.stop();
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        if (this.streamSource && this.isMic) {
            this.streamSource.disconnect();
            // Stop microphone tracks
            this.streamSource.mediaStream.getTracks().forEach(track => track.stop());
            this.streamSource = null;
        }
        if (this.analyser) {
             // Disconnect analyser only if it was connected to destination (for file playback)
             // For mic, it's only connected to streamSource which is handled above.
            if (!this.isMic) {
                try {
                    this.analyser.disconnect(this.audioContext.destination);
                } catch(e) {
                    // Ignore errors if already disconnected
                }
            }
        }
        this.isPlaying = false;
        // Do not reset isMic here, it indicates the *selected* source type
    }

    getFrequencyData() {
        if (!this.analyser || !this.dataArray) {
            // Return a zeroed array if analyser isn't ready
            const bufferLength = this.analyser?.frequencyBinCount || 1024;
            return new Uint8Array(bufferLength);
        }
        this.analyser.getByteFrequencyData(this.dataArray);
        return this.dataArray;
    }

    getFrequencyRangeData(range = 'mid') {
        const fullData = this.getFrequencyData();
        if (!this.audioContext || fullData.length === 0) return new Uint8Array();

        const [lowFreq, highFreq] = this.frequencyRanges[range];
        const nyquist = this.audioContext.sampleRate / 2;
        const lowIndex = Math.max(0, Math.round((lowFreq / nyquist) * fullData.length));
        const highIndex = Math.min(fullData.length, Math.round((highFreq / nyquist) * fullData.length));

        return fullData.slice(lowIndex, highIndex);
    }

    getAverageAmplitude(range = 'mid') {
        const data = this.getFrequencyRangeData(range);
        if (data.length === 0) return 0;
        const sum = data.reduce((acc, val) => acc + val, 0);
        return sum / data.length;
    }
}
