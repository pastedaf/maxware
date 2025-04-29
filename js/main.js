import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import * as dat from 'https://cdn.skypack.dev/dat.gui';

import { GridManager } from './GridManager.js';
import { AudioManager } from './AudioManager.js';
import { CameraManager } from './CameraManager.js'; // Import CameraManager
import { CameraVisualizer } from './CameraVisualizer.js'; // Import CameraVisualizer

// --- Constants ---
const GRID_SIZE = 15; // Physical size
const GRID_SEGMENTS = 63; // Number of segments (vertices = segments + 1)
const VIDEO_ELEMENT_ID = 'webcamFeed'; // ID of the video element in HTML

// --- Basic Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('gridCanvas'),
    antialias: true // Note: FXAA might be preferred over native antialias
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

// --- Controls ---
const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.05;
orbitControls.autoRotate = true;
orbitControls.autoRotateSpeed = 1.0;

// --- GUI ---
const gui = new dat.GUI();
gui.width = 300; // Make GUI slightly wider

// --- Managers ---
const audioManager = new AudioManager();
const cameraManager = new CameraManager(VIDEO_ELEMENT_ID); // Instantiate CameraManager with video element ID
const gridManager = new GridManager(scene, gui, GRID_SIZE, GRID_SEGMENTS);
const cameraVisualizer = new CameraVisualizer(scene, cameraManager, { // Instantiate CameraVisualizer
    widthSegments: 128, // Higher resolution for visualization
    heightSegments: 96,
    visible: false // Start hidden
});
// Setup transform controls *after* adding the first grid instance potentially
// gridManager.setupTransformControls(camera, renderer.domElement, orbitControls); // Moved after initial instance add

// --- Post Processing ---
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5, // strength
    0.4, // threshold
    0.85 // radius
);
composer.addPass(bloomPass);

const pixelatePass = new ShaderPass({
    uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        pixelSize: { value: 8 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 resolution;
        uniform float pixelSize;
        varying vec2 vUv;
        void main() {
            vec2 dxy = pixelSize / resolution;
            vec2 coord = dxy * floor(vUv / dxy);
            gl_FragColor = texture2D(tDiffuse, coord);
        }
    `
});
composer.addPass(pixelatePass);

const fxaaPass = new ShaderPass(FXAAShader);
fxaaPass.uniforms['resolution'].value.set(1 / window.innerWidth, 1 / window.innerHeight);
composer.addPass(fxaaPass);


// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // Slightly less ambient
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); // Slightly less directional
directionalLight.position.set(5, 10, 7); // Adjust position
scene.add(directionalLight);

// --- Initial State ---
camera.position.set(GRID_SIZE * 0.7, GRID_SIZE * 0.7, GRID_SIZE * 0.7); // Adjust camera based on grid size
camera.lookAt(0, 0, 0);

// --- Global Settings & Audio/Camera Control ---
const settings = {
    // General View/Control Settings
    transformMode: 'translate',
    autoRotateSpeed: orbitControls.autoRotateSpeed,
    globalBackgroundColor: scene.background.getHex(),
    // Post Processing Settings
    bloomStrength: bloomPass.strength,
    bloomThreshold: bloomPass.threshold,
    bloomRadius: bloomPass.radius,
    bloomEnabled: true,
    pixelateEnabled: true,
    fxaaEnabled: true,
    pixelSize: pixelatePass.uniforms.pixelSize.value,
    // Instance Management Functions (bound to GUI)
    cloneCurrent: () => {
        gridManager.addInstance(gridManager.currentInstance); // Clone selected or add default if none
    },
    deleteCurrent: () => gridManager.deleteCurrent(),
};

const audioSettings = {
    source: 'None', // 'None', 'Audio File', 'Microphone', 'Video File'
    triggerAudioFileInput: () => {
        document.getElementById('audioInput').click();
    },
    lastAudioFileLoaded: '',
};

// Separate settings object for camera interactions
const cameraSettings = {
    source: 'None', // 'None', 'Webcam', 'Video File' - Tracks camera source specifically
    triggerVideoFileInput: () => {
        document.getElementById('videoInput').click();
    },
    lastVideoFileLoaded: '',
    cameraMotionEnabled: false, // For grid influence
    cameraVisualizationEnabled: false, // For particle display
    visualizationDepthScale: cameraVisualizer.options.depthScale,
    visualizationParticleSize: cameraVisualizer.options.particleSize,
};


// --- GUI Setup ---

// Global Settings Folder
const globalFolder = gui.addFolder('Global Settings');
globalFolder.addColor(settings, 'globalBackgroundColor').name('Background').onChange(val => scene.background.setHex(val));
globalFolder.add(settings, 'transformMode', ['translate', 'rotate', 'scale'])
    .name("Transform Mode")
    .onChange(val => gridManager.setTransformMode(val));
globalFolder.add(orbitControls, 'autoRotate').name("Auto Rotate");
globalFolder.add(settings, 'autoRotateSpeed', 0.1, 10).name("Rotate Speed").onChange(val => orbitControls.autoRotateSpeed = val);
// globalFolder.open(); // Keep closed by default

// Audio & Camera Folder
const audioCameraFolder = gui.addFolder('Audio & Camera');

// --- Audio Source Controls ---
const audioSourceController = audioCameraFolder.add(audioSettings, 'source', ['None', 'Audio File', 'Microphone']).name('Audio Source');
const audioFileButtonController = audioCameraFolder.add(audioSettings, 'triggerAudioFileInput').name('Load Audio File');
audioFileButtonController.domElement.style.display = audioSettings.source === 'Audio File' ? 'block' : 'none'; // Show initially based on default

audioSourceController.onChange(async (value) => {
    audioFileButtonController.domElement.style.display = value === 'Audio File' ? 'block' : 'none'; // Toggle button visibility
    audioManager.stop(); // Stop previous audio source

    if (value === 'Microphone') {
        try {
            await audioManager.useMicrophone();
        } catch (error) {
            console.error("Failed to start microphone via GUI:", error);
            audioSettings.source = 'None'; // Revert selection on error
            audioSourceController.updateDisplay(); // Update GUI
        }
    } else if (value === 'Audio File') {
        // If a file was previously loaded, maybe replay it? Or force selection.
        // For now, just trigger the input. If the user cancels, source remains 'Audio File'.
        audioSettings.triggerAudioFileInput();
    }
});

// --- Camera Source Controls ---
const cameraSourceController = audioCameraFolder.add(cameraSettings, 'source', ['None', 'Webcam', 'Video File']).name('Camera Source');
const videoFileButtonController = audioCameraFolder.add(cameraSettings, 'triggerVideoFileInput').name('Load Video File');
videoFileButtonController.domElement.style.display = cameraSettings.source === 'Video File' ? 'block' : 'none'; // Show initially based on default

cameraSourceController.onChange(async (value) => {
    videoFileButtonController.domElement.style.display = value === 'Video File' ? 'block' : 'none'; // Toggle button visibility
    // Reset camera manager only if switching *away* from a source or to a *different* source type
    if (cameraManager.isInitialized && cameraManager.sourceType !== value.toLowerCase()) {
        cameraManager.resetSource();
    }

    // If enabling Webcam or Video File, and motion/viz is enabled, start it
    if (value === 'Webcam') {
        const success = await cameraManager.initCamera();
        if (!success) {
            cameraSettings.source = 'None'; // Revert on failure
            cameraSourceController.updateDisplay();
        } else if (cameraSettings.cameraMotionEnabled || cameraSettings.cameraVisualizationEnabled) {
            cameraManager.start(); // Start if needed
        }
    } else if (value === 'Video File') {
        // Trigger file input. Loading and starting happens in the input's event listener.
        cameraSettings.triggerVideoFileInput();
    } else { // value === 'None'
        // Stop and reset the camera manager if source is set to None
        cameraManager.resetSource();
        // Also disable motion/visualization toggles if source is None
        if (cameraSettings.cameraMotionEnabled) {
            cameraSettings.cameraMotionEnabled = false;
            audioCameraFolder.__controllers.forEach(c => { if (c.property === 'cameraMotionEnabled') c.updateDisplay(); });
        }
        if (cameraSettings.cameraVisualizationEnabled) {
            cameraSettings.cameraVisualizationEnabled = false;
            cameraVisualizer.setVisible(false);
            audioCameraFolder.__controllers.forEach(c => { if (c.property === 'cameraVisualizationEnabled') c.updateDisplay(); });
        }
    }
});


// --- Camera Interaction Controls ---
audioCameraFolder.add(cameraSettings, 'cameraMotionEnabled').name('Enable Grid Motion')
    .onChange(async (enabled) => {
        if (enabled) {
            // Only try to init/start if a source is selected
            if (cameraSettings.source === 'Webcam') {
                if (!cameraManager.isInitialized || cameraManager.sourceType !== 'webcam') {
                    const success = await cameraManager.initCamera();
                    if (!success) {
                        cameraSettings.cameraMotionEnabled = false;
                        audioCameraFolder.__controllers.forEach(c => { if (c.property === 'cameraMotionEnabled') c.updateDisplay(); });
                        return; // Exit if init failed
                    }
                }
                cameraManager.start(); // Start webcam processing
            } else if (cameraSettings.source === 'Video File') {
                if (!cameraManager.isInitialized || cameraManager.sourceType !== 'video') {
                    // Need to load a video first
                    alert("Please load a video file first using the 'Load Video File' button.");
                    cameraSettings.cameraMotionEnabled = false;
                    audioCameraFolder.__controllers.forEach(c => { if (c.property === 'cameraMotionEnabled') c.updateDisplay(); });
                    return;
                }
                cameraManager.start(); // Start video file processing
            } else { // Source is 'None'
                alert("Please select a Camera Source (Webcam or Video File) first.");
                cameraSettings.cameraMotionEnabled = false;
                audioCameraFolder.__controllers.forEach(c => { if (c.property === 'cameraMotionEnabled') c.updateDisplay(); });
                return;
            }
        } else {
            // Stop processing, but don't reset source unless visualization is also off
            if (!cameraSettings.cameraVisualizationEnabled) {
                cameraManager.stop(); // Stop processing only
            }
        }
    });

audioCameraFolder.add(cameraSettings, 'cameraVisualizationEnabled').name('Enable Visualization')
    .onChange(async (enabled) => {
        if (enabled) {
            // Only try to init/start if a source is selected
            if (cameraSettings.source === 'Webcam') {
                if (!cameraManager.isInitialized || cameraManager.sourceType !== 'webcam') {
                    const success = await cameraManager.initCamera();
                    if (!success) {
                        cameraSettings.cameraVisualizationEnabled = false;
                        audioCameraFolder.__controllers.forEach(c => { if (c.property === 'cameraVisualizationEnabled') c.updateDisplay(); });
                        return; // Exit if init failed
                    }
                }
                cameraManager.start(); // Start webcam processing (needed for visualization updates)
                cameraVisualizer.setVisible(true);
            } else if (cameraSettings.source === 'Video File') {
                if (!cameraManager.isInitialized || cameraManager.sourceType !== 'video') {
                    alert("Please load a video file first using the 'Load Video File' button.");
                    cameraSettings.cameraVisualizationEnabled = false;
                    audioCameraFolder.__controllers.forEach(c => { if (c.property === 'cameraVisualizationEnabled') c.updateDisplay(); });
                    return;
                }
                cameraManager.start(); // Start video file processing
                cameraVisualizer.setVisible(true);
            } else { // Source is 'None'
                alert("Please select a Camera Source (Webcam or Video File) first.");
                cameraSettings.cameraVisualizationEnabled = false;
                audioCameraFolder.__controllers.forEach(c => { if (c.property === 'cameraVisualizationEnabled') c.updateDisplay(); });
                return;
            }
        } else {
            cameraVisualizer.setVisible(false);
            // Stop processing only if grid motion is also disabled
            if (!cameraSettings.cameraMotionEnabled) {
                 cameraManager.stop(); // Stop processing
            }
        }
    });
audioCameraFolder.add(cameraSettings, 'visualizationDepthScale', 1, 20).name('Vis Depth Scale').onChange(val => cameraVisualizer.setDepthScale(val));
audioCameraFolder.add(cameraSettings, 'visualizationParticleSize', 0.01, 0.5).name('Vis Particle Size').onChange(val => cameraVisualizer.setParticleSize(val));

audioCameraFolder.open(); // Keep open by default


// Post Processing Folder
const ppFolder = gui.addFolder('Post Processing');
ppFolder.add(settings, 'pixelateEnabled').name("Pixelate").onChange(val => pixelatePass.enabled = val);
ppFolder.add(settings, 'pixelSize', 1, 32).step(1).onChange(val => pixelatePass.uniforms.pixelSize.value = val);
ppFolder.add(settings, 'fxaaEnabled').name("FXAA").onChange(val => fxaaPass.enabled = val);
ppFolder.add(settings, 'bloomEnabled').name("Bloom").onChange(val => bloomPass.enabled = val);
ppFolder.add(settings, 'bloomStrength', 0, 3).onChange(val => bloomPass.strength = val);
ppFolder.add(settings, 'bloomThreshold', 0, 1).onChange(val => bloomPass.threshold = val);
ppFolder.add(settings, 'bloomRadius', 0, 1).onChange(val => bloomPass.radius = val);
// ppFolder.open(); // Keep closed by default

// Instance Management Folder
const instanceManagement = gui.addFolder('Instance Management');
instanceManagement.add(settings, 'cloneCurrent').name("Clone Selected / Add New");
instanceManagement.add(settings, 'deleteCurrent').name("Delete Selected");
instanceManagement.open(); // Keep open

// --- Event Listeners ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isDragging = false; // Used for mouse interaction logic

// Hidden Audio File Input Listener
document.getElementById('audioInput').addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        audioSettings.lastAudioFileLoaded = file.name; // Store filename
        try {
            await audioManager.loadAudio(file);
            audioManager.play();
            // Ensure GUI reflects Audio File source if user selected via button
            if (audioSettings.source !== 'Audio File') {
                 audioSettings.source = 'Audio File';
                 audioSourceController.updateDisplay();
                 audioFileButtonController.domElement.style.display = 'block';
            }
        } catch (error) {
            console.error("Failed to load or play audio:", error);
            audioSettings.source = 'None'; // Revert on error
            audioSourceController.updateDisplay();
            audioFileButtonController.domElement.style.display = 'none';
        } finally {
             document.getElementById('audioInput').value = ''; // Clear input regardless of success/fail
        }
    } else {
         // User cancelled file selection
         if (audioSettings.source === 'Audio File') {
             // If source was already Audio File (e.g., clicked button again), revert to None
             audioSettings.source = 'None';
             audioSourceController.updateDisplay();
             audioFileButtonController.domElement.style.display = 'none';
         }
    }
});

// Hidden Video File Input Listener
document.getElementById('videoInput').addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        cameraSettings.lastVideoFileLoaded = file.name; // Store filename
        try {
            const success = await cameraManager.loadVideo(file);
            if (success) {
                // Ensure GUI reflects Video File source
                if (cameraSettings.source !== 'Video File') {
                    cameraSettings.source = 'Video File';
                    cameraSourceController.updateDisplay();
                    videoFileButtonController.domElement.style.display = 'block';
                }
                // If motion or visualization is enabled, start the video
                if (cameraSettings.cameraMotionEnabled || cameraSettings.cameraVisualizationEnabled) {
                    cameraManager.start();
                }
            } else {
                 throw new Error("CameraManager failed to load video."); // Throw error to be caught below
            }
        } catch (error) {
            console.error("Failed to load or start video:", error);
            alert(`Failed to load video: ${error.message}`);
            cameraSettings.source = 'None'; // Revert on error
            cameraSourceController.updateDisplay();
            videoFileButtonController.domElement.style.display = 'none';
            cameraManager.resetSource(); // Ensure cleanup
        } finally {
            document.getElementById('videoInput').value = ''; // Clear input
        }
    } else {
         // User cancelled file selection
         if (cameraSettings.source === 'Video File') {
             // If source was already Video File, revert to None
             cameraSettings.source = 'None';
             cameraSourceController.updateDisplay();
             videoFileButtonController.domElement.style.display = 'none';
             cameraManager.resetSource(); // Clean up if they cancel
         }
    }
});


// Mouse Interaction for Grid Selection / Modification
window.addEventListener('mousedown', (e) => {
    // Prevent interaction if clicking on GUI
    if (e.target.closest('.dg')) return;

    isDragging = true; // Assume dragging starts on mousedown

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    // Intersect grids, but ignore camera visualizer points
    const intersectableObjects = gridManager.instances;
    const intersects = raycaster.intersectObjects(intersectableObjects);


    if (intersects.length > 0) {
        // Don't select if transform controls are being dragged
        if (!gridManager.transformControls || !gridManager.transformControls.dragging) {
             gridManager.selectInstance(intersects[0].object);
        }
    }
    // Note: Dragging state for orbit controls is handled by transform controls listener
});

window.addEventListener('mousemove', (e) => {
    // If dragging is initiated by transform controls, let it handle orbit control disabling
    if (gridManager.transformControls?.dragging) {
        isDragging = true; // Ensure our flag matches
        return;
    }
    // If dragging wasn't initiated by transform controls (i.e., general scene drag)
    if (isDragging && orbitControls.enabled) {
         // Standard orbit controls drag - no grid modification
    } else if (!isDragging && gridManager.currentInstance) {
        // Hover effect when not dragging - modify grid (poke)
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(gridManager.currentInstance);

        if (intersects.length > 0) {
            const localPoint = gridManager.currentInstance.worldToLocal(intersects[0].point.clone());
            modifyGrid(gridManager.currentInstance, localPoint);
        }
    }
});

window.addEventListener('mouseup', () => {
    isDragging = false;
});


window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    pixelatePass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    fxaaPass.uniforms['resolution'].value.set(1 / window.innerWidth, 1 / window.innerHeight);
});

// --- Core Logic Functions ---

function modifyGrid(grid, point) {
    const vertices = grid.geometry.attributes.position.array;
    const targetHeights = grid.userData.targetHeights;
    const settings = grid.userData.settings; // Get instance-specific settings
    const size = grid.geometry.parameters.width;
    const segments = grid.geometry.parameters.widthSegments;
    const verticesPerSide = segments + 1;
    const halfSize = size / 2;

    const modificationRadius = settings.pokeRadius;
    const pokeStrength = settings.pokeStrength;
    const maxPokeHeight = settings.heightScale * 1.5; // Limit poke height relative to scale

    for (let i = 0; i < targetHeights.length; i++) {
        // Calculate vertex position in local grid space (plane is in XY initially)
        const x = (i % verticesPerSide) * (size / segments) - halfSize;
        const y = Math.floor(i / verticesPerSide) * (size / segments) - halfSize; // Corresponds to Z in world after rotation

        // Use the point's x and y (since grid is rotated to be flat on XZ plane)
        const dx = x - point.x;
        const dy = y - point.y; // Compare with point.y which corresponds to local Z
        const distance = Math.sqrt(dx * dx + dy * dy);


        if (distance < modificationRadius) {
            const falloff = 1 - (distance / modificationRadius);
            const strength = falloff * pokeStrength;
            // Increase target height, but clamp to maxPokeHeight
            targetHeights[i] = Math.min(targetHeights[i] + strength, maxPokeHeight);
        }
    }
    // No need to set needsUpdate here, updateGrid does it every frame
}

function updateGrid(grid, motionScore) {
    const settings = grid.userData.settings;
    if (!settings.visible) return; // Skip update if not visible

    const frequencyData = audioManager.getFrequencyRangeData(settings.frequencyRange);
    const vertices = grid.geometry.attributes.position.array;
    const colors = grid.geometry.attributes.color.array;
    const targetHeights = grid.userData.targetHeights;

    const size = grid.geometry.parameters.width;
    const segments = grid.geometry.parameters.widthSegments;
    const verticesPerSide = segments + 1;
    const halfSize = size / 2;
    const maxDistance = Math.sqrt(halfSize * halfSize + halfSize * halfSize);

    // --- Calculate effective parameters based on motion ---
    let effectiveHeightScale = settings.heightScale;
    let effectiveDecayRate = settings.decayRate;

    // Use cameraSettings.cameraMotionEnabled to check if motion influence is active
    // Also check if cameraManager is actually running (has a valid source and is processing)
    if (cameraSettings.cameraMotionEnabled && cameraManager.isRunning && settings.motionInfluenceFactor > 0) {
        const influence = motionScore * settings.motionInfluenceFactor;
        // Motion increases height scale
        effectiveHeightScale = settings.heightScale * (1 + influence);
        // Motion makes decay *slower* (closer to 1.0)
        effectiveDecayRate = settings.decayRate + (1.0 - settings.decayRate) * influence * 0.5; // Subtle effect
        effectiveDecayRate = Math.min(effectiveDecayRate, 0.999); // Clamp
    }

    // --- Get full frequency data for frequencyBands color mode ---
    let lowAmp = 0, midAmp = 0, highAmp = 0;
     if (settings.colorMapping === 'frequencyBands') {
         lowAmp = audioManager.getAverageAmplitude('low') / 255; // Normalize
         midAmp = audioManager.getAverageAmplitude('mid') / 255;
         highAmp = audioManager.getAverageAmplitude('high') / 255;
     }

    // --- Time for sine wave pattern ---
    const time = performance.now() * 0.002; // Simple time factor

    for (let i = 0; i < targetHeights.length; i++) {
        // Calculate vertex position in local grid space (plane is in XY initially)
        const x = (i % verticesPerSide) * (size / segments) - halfSize;
        const y = Math.floor(i / verticesPerSide) * (size / segments) - halfSize; // Corresponds to Z in world after rotation

        let audioValue = 0;
        let patternHeight = 0; // Height contribution from non-audio patterns

        // Only use audio data if an audio source is active
        if (frequencyData.length > 0 && audioSettings.source !== 'None') {
            switch (settings.wavePattern) {
                case 'radial':
                    const distance = Math.sqrt(x * x + y * y);
                    const normalizedDistance = Math.min(distance / maxDistance, 1.0);
                    const index = Math.floor(normalizedDistance * (frequencyData.length - 1));
                    audioValue = frequencyData[index] || 0;
                    break;
                case 'linear':
                    audioValue = frequencyData[i % frequencyData.length] || 0;
                    break;
                case 'random':
                    audioValue = frequencyData[Math.floor(Math.random() * frequencyData.length)] || 0;
                    break;
                case 'sineWave':
                    const distFromCenter = Math.sqrt(x * x + y * y);
                    // Wave propagates outwards, influenced by average mid-frequency amplitude
                    const avgMidAmp = audioManager.getAverageAmplitude('mid') / 255; // Normalized 0-1
                    patternHeight = Math.sin(distFromCenter * (1 + avgMidAmp * 2) - time * (1 + avgMidAmp * 5)) * (0.5 + avgMidAmp);
                    // Use overall average amplitude for audioValue in this mode
                    audioValue = audioManager.getAverageAmplitude(settings.frequencyRange);
                    break;
                case 'checkerboard':
                    // Determine if the vertex is on a 'black' or 'white' square
                    const scale = 4.0; // Adjust size of checkers
                    const checkX = Math.floor((x + halfSize) / scale);
                    const checkY = Math.floor((y + halfSize) / scale);
                    if ((checkX + checkY) % 2 === 0) {
                        // Use low frequency for 'black' squares
                        audioValue = audioManager.getAverageAmplitude('low');
                    } else {
                        // Use high frequency for 'white' squares
                        audioValue = audioManager.getAverageAmplitude('high');
                    }
                    break;
                default:
                     audioValue = frequencyData[i % frequencyData.length] || 0; // Fallback
            }
        }

        // Calculate height based on audio and apply influence/scale
        const audioHeight = (audioValue / 255) * effectiveHeightScale * settings.audioInfluence;

        // Add pattern height (only non-zero for sineWave currently)
        const totalPatternHeight = audioHeight + (patternHeight * effectiveHeightScale * settings.audioInfluence);

        // Apply decay to target height (from mouse interaction)
        targetHeights[i] *= effectiveDecayRate;
        if (targetHeights[i] < 0.01) targetHeights[i] = 0; // Floor small values

        // Final vertex height is the max of decayed target height and current pattern height
        const finalHeight = Math.max(targetHeights[i], totalPatternHeight);
        vertices[i * 3 + 2] = finalHeight; // Set the Z coordinate (which acts as height)

        // --- Color Calculation ---
        let colorFactor = 0;
        const normalizedHeight = finalHeight / effectiveHeightScale; // Normalize height relative to scale
        const normalizedAudio = audioValue / 255;
        const tempColor = new THREE.Color(); // Reuse color object

        switch (settings.colorMapping) {
            case 'height':
                colorFactor = THREE.MathUtils.clamp(normalizedHeight, 0, 1);
                break;
            case 'audio':
                colorFactor = THREE.MathUtils.clamp(normalizedAudio, 0, 1);
                break;
            case 'combined':
                colorFactor = THREE.MathUtils.clamp((normalizedHeight + normalizedAudio) / 2, 0, 1);
                break;
             case 'frequencyBands':
                 // Mix colors based on normalized low/mid/high amplitudes
                 tempColor.setRGB(0,0,0); // Start black
                 // Only apply colors if an audio source is active
                 if (audioSettings.source !== 'None') {
                     tempColor.lerp(settings.lowColor, lowAmp);
                     tempColor.lerp(settings.midColor, midAmp); // Lerp towards mid based on midAmp
                     tempColor.lerp(settings.highColor, highAmp); // Lerp towards high based on highAmp
                 } else {
                     // Default to midColor if no audio? Or maybe lowColor?
                     tempColor.copy(settings.midColor);
                 }
                 break; // Skip standard lerp below
        }

        // Interpolate color based on the factor (unless handled by frequencyBands)
        if (settings.colorMapping !== 'frequencyBands') {
            if (colorFactor < 0.5) {
                tempColor.lerpColors(settings.lowColor, settings.midColor, colorFactor * 2);
            } else {
                tempColor.lerpColors(settings.midColor, settings.highColor, (colorFactor - 0.5) * 2);
            }
        }

        colors[i * 3] = tempColor.r;
        colors[i * 3 + 1] = tempColor.g;
        colors[i * 3 + 2] = tempColor.b;
    }

    grid.geometry.attributes.position.needsUpdate = true;
    grid.geometry.attributes.color.needsUpdate = true;
    grid.geometry.computeVertexNormals(); // Important for lighting on dynamic geometry
}


// --- Animation Loop ---
let lastTimestamp = 0;
function animate(timestamp) {
    requestAnimationFrame(animate);

    const deltaTime = (timestamp - lastTimestamp) * 0.001; // Delta time in seconds
    lastTimestamp = timestamp;

    // --- Get Motion Score (only if enabled and camera is running) ---
    let motionScore = 0;
    if (cameraSettings.cameraMotionEnabled && cameraManager.isRunning) {
        motionScore = cameraManager.getMotionScore(); // Processes frame internally
    }

    // --- Update Camera Visualization (if enabled and camera is running) ---
    if (cameraSettings.cameraVisualizationEnabled && cameraManager.isRunning) {
        // CameraManager.getMotionScore() already processes the frame if motion is enabled.
        // If only visualization is enabled, we might need an explicit process call.
        // Let's ensure processFrame is called if visualization is on but motion is off.
        if (!cameraSettings.cameraMotionEnabled) {
            cameraManager.processFrame(); // Process frame specifically for visualization
        }
        cameraVisualizer.update(); // Update particle positions/colors
    } else if (!cameraSettings.cameraVisualizationEnabled && cameraVisualizer.points && cameraVisualizer.points.visible) {
        // Ensure visualizer is hidden if disabled
        cameraVisualizer.setVisible(false);
    }


    // --- Global Effects (like Camera FOV based on overall audio) ---
    if (audioSettings.source !== 'None') {
        const averageAmplitude = audioManager.getAverageAmplitude('mid'); // Use mid range for FOV effect
        const minFOV = 70; // Adjusted range
        const maxFOV = 80;
        const amplitudeFactor = THREE.MathUtils.clamp(averageAmplitude / 128, 0, 1); // Normalize (0-255 -> 0-1, using 128 as midpoint)
        // Smooth FOV change using deltaTime
        const targetFOV = THREE.MathUtils.lerp(minFOV, maxFOV, amplitudeFactor);
        camera.fov = THREE.MathUtils.lerp(camera.fov, targetFOV, Math.min(deltaTime * 5.0, 1.0)); // Adjust lerp speed (5.0)
        camera.updateProjectionMatrix();
    }


    // --- Update each grid instance ---
    gridManager.instances.forEach(grid => {
        updateGrid(grid, motionScore); // Pass motion score
    });

    orbitControls.update(); // Update orbit controls (handles damping, auto-rotate)

    composer.render(); // Render scene with post-processing
}

// --- Initialization ---
gridManager.addInstance(); // Add the initial grid
gridManager.setupTransformControls(camera, renderer.domElement, orbitControls); // Setup controls *after* first instance exists
animate(0); // Start the animation loop
