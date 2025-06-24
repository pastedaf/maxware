import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import * as dat from 'https://cdn.skypack.dev/dat.gui';

import { ObjectManager } from './ObjectManager.js'; // Import ObjectManager
import { AudioManager } from './AudioManager.js';
import { CameraManager } from './CameraManager.js';
import { CameraVisualizer } from './CameraVisualizer.js';
import { PortalManager } from './PortalManager.js'; // Import PortalManager
// GridManager is no longer used.

// --- Constants ---
const GRID_SIZE = 15; // Physical size for grids (used for initial grid and camera positioning)
const GRID_SEGMENTS = 63; // Number of segments for grids (used for initial grid)
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
orbitControls.autoRotate = false;
orbitControls.autoRotateSpeed = 1.0;

// --- GUI ---
const gui = new dat.GUI({ autoPlace: false }); // Disable autoPlace
gui.width = 350; // Make GUI slightly wider for more controls
const guiContainer = document.getElementById('gui-container');
guiContainer.appendChild(gui.domElement); // Place GUI in our container

// --- Managers ---
const audioManager = new AudioManager();
const cameraManager = new CameraManager(VIDEO_ELEMENT_ID);
const objectManager = new ObjectManager(scene, gui, GRID_SIZE, GRID_SEGMENTS); // Instantiate ObjectManager
const cameraVisualizer = new CameraVisualizer(scene, cameraManager, audioManager, { // Pass audioManager
    widthSegments: 128, // Higher resolution visualizer
    heightSegments: 96,
    visible: false, // Start hidden
    colorMode: 'brightness', // Initial color mode
    position: new THREE.Vector3(0, 5, -10), // Example initial position
    rotation: new THREE.Euler(0, 0, 0),
    scale: new THREE.Vector3(1, 1, 1),
});
const portalManager = new PortalManager(scene, renderer, camera, objectManager); // Instantiate PortalManager, pass objectManager

// --- Post Processing ---
// If using PortalManager's custom render loop, composer might need adjustments or be used selectively.
// For now, let's assume portals are rendered before post-processing.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5, 0.4, 0.85
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
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 10, 7);
scene.add(directionalLight);

// --- Initial State ---
camera.position.set(GRID_SIZE * 0.7, GRID_SIZE * 0.7, GRID_SIZE * 1.2); // Adjust camera based on grid size, pull back slightly
camera.lookAt(0, 0, 0);

// --- Global Settings & Audio/Camera Control ---
const settings = {
    // General View/Control Settings
    transformMode: 'translate',
    autoRotateSpeed: orbitControls.autoRotateSpeed,
    // Background Settings
    backgroundType: 'Solid', // Solid, LinearGradient, RadialGradient, Image
    globalBackgroundColor: scene.background.getHex(),
    gradientColor1: new THREE.Color(0x111111).getHex(),
    gradientColor2: new THREE.Color(0x555555).getHex(),
    imageBackgroundUrl: '',
    imageBackgroundRepeatX: 1,
    imageBackgroundRepeatY: 1,
    imageBackgroundDisplayMode: 'Cover', // Cover, Stretch, Tile
    triggerImageBackgroundLoad: () => { document.getElementById('imageBackgroundInput').click(); },
    // Post Processing Settings
    bloomStrength: bloomPass.strength,
    bloomThreshold: bloomPass.threshold,
    bloomRadius: bloomPass.radius,
    bloomEnabled: true,
    pixelateEnabled: true,
    fxaaEnabled: true,
    pixelSize: pixelatePass.uniforms.pixelSize.value,
    // Instance Management Functions (bound to GUI)
    addGrid: () => objectManager.addInstance('grid'),
    addPointCloud: () => objectManager.addInstance('pointcloud'),
    addSphere: () => objectManager.addInstance('sphere'),
    addTorus: () => objectManager.addInstance('torus'),
    addTorusKnot: () => objectManager.addInstance('torusknot'),
    deleteCurrent: () => objectManager.deleteCurrent(),
};

const audioSettings = {
    source: 'None',
    triggerAudioFileInput: () => {
        document.getElementById('audioInput').click();
    },
    lastAudioFileLoaded: '',
};

const cameraSettings = {
    source: 'None',
    triggerVideoFileInput: () => {
        document.getElementById('videoInput').click();
    },
    lastVideoFileLoaded: '',
    cameraMotionEnabled: false,
    // --- Camera Visualization Settings (Moved to separate folder/tab) ---
    // cameraVisualizationEnabled: false, // This will now be controlled in the visualizer tab
    // visualizationDepthScale: cameraVisualizer.options.depthScale,
    // visualizationParticleSize: cameraVisualizer.options.particleSize,
    // visualizationColorMode: cameraVisualizer.options.colorMode,
};

// --- Background Update Function ---
let backgroundTexture = null; // Keep a reference to dispose of old textures

function updateBackground() {
    // Dispose previous texture if it exists
    if (backgroundTexture && backgroundTexture.dispose) {
        backgroundTexture.dispose();
        backgroundTexture = null;
    }
    scene.background = null; // Clear previous background

    const type = settings.backgroundType;

    if (type === 'Solid') {
        scene.background = new THREE.Color(settings.globalBackgroundColor);
    } else if (type === 'LinearGradient' || type === 'RadialGradient') {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = window.innerWidth; // Use full window size for better quality
        canvas.height = window.innerHeight;

        let gradient;
        if (type === 'LinearGradient') {
            gradient = context.createLinearGradient(0, 0, 0, canvas.height);
        } else { // RadialGradient
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const radius = Math.max(centerX, centerY);
            gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        }

        gradient.addColorStop(0, settings.gradientColor1);
        gradient.addColorStop(1, settings.gradientColor2);

        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);

        backgroundTexture = new THREE.CanvasTexture(canvas);
        scene.background = backgroundTexture;
    } else if (type === 'Image') {
        if (settings.imageBackgroundUrl) {
            const loader = new THREE.TextureLoader();
            loader.load(
                settings.imageBackgroundUrl,
                (texture) => {
                    backgroundTexture = texture; // Store reference for potential disposal
                    if (settings.imageBackgroundDisplayMode === 'Tile') {
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                        texture.repeat.set(settings.imageBackgroundRepeatX, settings.imageBackgroundRepeatY);
                    } else if (settings.imageBackgroundDisplayMode === 'Stretch') {
                        texture.wrapS = THREE.ClampToEdgeWrapping;
                        texture.wrapT = THREE.ClampToEdgeWrapping;
                        texture.repeat.set(1, 1); // Ensure no repeat for stretch
                    } else { // 'Cover'
                        texture.wrapS = THREE.ClampToEdgeWrapping;
                        texture.wrapT = THREE.ClampToEdgeWrapping;
                        // Calculate aspect ratios
                        const imgAspect = texture.image.width / texture.image.height;
                        const screenAspect = window.innerWidth / window.innerHeight;

                        if (imgAspect > screenAspect) { // Image is wider than screen
                            texture.repeat.set(screenAspect / imgAspect, 1);
                            texture.offset.set((1 - screenAspect / imgAspect) / 2, 0); // Center horizontally
                        } else { // Image is taller than or equal aspect to screen
                            texture.repeat.set(1, imgAspect / screenAspect);
                            texture.offset.set(0, (1 - imgAspect / screenAspect) / 2); // Center vertically
                        }
                    }
                    texture.needsUpdate = true; // Signal Three.js to update the texture
                    scene.background = texture;
                },
                undefined, // onProgress callback (optional)
                (error) => {
                    console.error('Error loading background image:', error);
                    alert('Failed to load background image. Check URL or file.');
                    scene.background = new THREE.Color(settings.globalBackgroundColor); // Fallback
                }
            );
        } else {
            // No URL, fallback to solid color
            scene.background = new THREE.Color(settings.globalBackgroundColor);
        }
    }
    // console.log("Background updated to:", type, scene.background);
}


// --- GUI Setup ---

// --- Tab Management ---
const guiTabsContainer = document.getElementById('gui-tabs');
const guiFolders = {}; // Store references to folders
let activeTab = null;

function addTab(name, folder) {
    const button = document.createElement('button');
    button.textContent = name;
    button.addEventListener('click', () => switchTab(name));
    guiTabsContainer.appendChild(button);
    guiFolders[name] = { button, folder };
    // Hide folder initially
    folder.close(); // Close folder visually in dat.gui
    folder.domElement.style.display = 'none'; // Hide folder element
}

function switchTab(name) {
    if (activeTab === name) return; // Already active

    for (const tabName in guiFolders) {
        const tabData = guiFolders[tabName];
        const isTarget = tabName === name;
        tabData.folder.domElement.style.display = isTarget ? 'block' : 'none';
        tabData.button.classList.toggle('active', isTarget);
        if (isTarget) {
            tabData.folder.open(); // Open the target folder visually
        } else {
            tabData.folder.close(); // Close others
        }
    }
    activeTab = name;
    // console.log(`Switched to tab: ${name}`);
}
// --- End Tab Management ---


// --- Create GUI Folders ---

// Global Settings Folder
const globalFolder = gui.addFolder('Global Settings');
guiFolders['Global'] = { folder: globalFolder }; // Register folder (button added later)

// --- Background Controls ---
const backgroundFolder = globalFolder.addFolder('Background');
const bgTypeController = backgroundFolder.add(settings, 'backgroundType', ['Solid', 'LinearGradient', 'RadialGradient', 'Image']).name('Type');

const solidColorController = backgroundFolder.addColor(settings, 'globalBackgroundColor').name('Solid Color').onChange(val => {
    if (settings.backgroundType === 'Solid') scene.background.setHex(val);
});
const gradientColor1Controller = backgroundFolder.addColor(settings, 'gradientColor1').name('Gradient Color 1').onChange(updateBackground);
const gradientColor2Controller = backgroundFolder.addColor(settings, 'gradientColor2').name('Gradient Color 2').onChange(updateBackground);

const imageControls = {
    urlController: backgroundFolder.add(settings, 'imageBackgroundUrl').name('Image URL (or load)').onFinishChange(updateBackground),
    loadButtonController: backgroundFolder.add(settings, 'triggerImageBackgroundLoad').name('Load Image File'),
    displayModeController: backgroundFolder.add(settings, 'imageBackgroundDisplayMode', ['Cover', 'Stretch', 'Tile']).name('Display Mode').onChange(updateBackground),
    repeatXController: backgroundFolder.add(settings, 'imageBackgroundRepeatX', 1, 10).step(1).name('Repeat X').onChange(updateBackground),
    repeatYController: backgroundFolder.add(settings, 'imageBackgroundRepeatY', 1, 10).step(1).name('Repeat Y').onChange(updateBackground)
};

function toggleBackgroundControls(type) {
    solidColorController.domElement.style.display = (type === 'Solid') ? '' : 'none'; // .domElement is the li, which is the row
    gradientColor1Controller.domElement.style.display = (type === 'LinearGradient' || type === 'RadialGradient') ? '' : 'none';
    gradientColor2Controller.domElement.style.display = (type === 'LinearGradient' || type === 'RadialGradient') ? '' : 'none';
    imageControls.urlController.domElement.style.display = (type === 'Image') ? '' : 'none';
    imageControls.loadButtonController.domElement.style.display = (type === 'Image') ? '' : 'none';
    imageControls.displayModeController.domElement.style.display = (type === 'Image') ? '' : 'none';
    const showRepeat = type === 'Image' && settings.imageBackgroundDisplayMode === 'Tile';
    imageControls.repeatXController.domElement.style.display = showRepeat ? '' : 'none';
    imageControls.repeatYController.domElement.style.display = showRepeat ? '' : 'none';
    updateBackground(); // Update background when type changes
}

bgTypeController.onChange(toggleBackgroundControls);
// Initialize visibility
toggleBackgroundControls(settings.backgroundType);
backgroundFolder.open();
// --- End Background Controls ---


globalFolder.add(settings, 'transformMode', ['translate', 'rotate', 'scale'])
    .name("Transform Mode")
    .onChange(val => objectManager.setTransformMode(val)); // Use objectManager
globalFolder.add(orbitControls, 'autoRotate').name("Orbit Auto Rotate"); // Renamed for clarity
globalFolder.add(settings, 'autoRotateSpeed', 0.1, 10).name("Orbit Rotate Speed").onChange(val => orbitControls.autoRotateSpeed = val); // Renamed for clarity


// Audio & Camera Folder
const audioCameraFolder = gui.addFolder('Audio & Camera');
guiFolders['Sources'] = { folder: audioCameraFolder }; // Register folder
// --- Audio Source Controls ---
const audioSourceController = audioCameraFolder.add(audioSettings, 'source', ['None', 'Audio File', 'Microphone']).name('Audio Source');
const audioFileButtonController = audioCameraFolder.add(audioSettings, 'triggerAudioFileInput').name('Load Audio File');
audioFileButtonController.domElement.style.display = audioSettings.source === 'Audio File' ? 'block' : 'none';
audioSourceController.onChange(async (value) => {
    audioFileButtonController.domElement.style.display = value === 'Audio File' ? 'block' : 'none';
    audioManager.stop();
    if (value === 'Microphone') {
        try { await audioManager.useMicrophone(); } catch (error) {
            console.error("Failed to start microphone via GUI:", error);
            audioSettings.source = 'None'; audioSourceController.updateDisplay();
        }
    } else if (value === 'Audio File') { audioSettings.triggerAudioFileInput(); }
});
// --- Camera Source Controls ---
const cameraSourceController = audioCameraFolder.add(cameraSettings, 'source', ['None', 'Webcam', 'Video File']).name('Camera Source');
const videoFileButtonController = audioCameraFolder.add(cameraSettings, 'triggerVideoFileInput').name('Load Video File');
videoFileButtonController.domElement.style.display = cameraSettings.source === 'Video File' ? 'block' : 'none';
cameraSourceController.onChange(async (value) => {
    videoFileButtonController.domElement.style.display = value === 'Video File' ? 'block' : 'none';
    if (cameraManager.isInitialized && cameraManager.sourceType !== value.toLowerCase()) { cameraManager.resetSource(); }

    let success = false;
    if (value === 'Webcam') {
        success = await cameraManager.initCamera();
        if (!success) { cameraSettings.source = 'None'; cameraSourceController.updateDisplay(); }
    } else if (value === 'Video File') {
        cameraSettings.triggerVideoFileInput(); // Loading handled by input listener
        // Success determined later
    } else { // value === 'None'
        cameraManager.resetSource();
        // Disable dependent features if source is None
        if (cameraSettings.cameraMotionEnabled) {
            cameraSettings.cameraMotionEnabled = false;
            audioCameraFolder.__controllers.find(c => c.property === 'cameraMotionEnabled')?.updateDisplay();
        }
        // Also disable visualizer if source is None
        const visualizerPoints = cameraVisualizer.getPointsObject();
        if (visualizerPoints && visualizerPoints.visible) {
            cameraVisualizer.setVisible(false);
            visualizerFolder.__controllers.find(c => c.property === 'enableVisualizer')?.setValue(false);
        }
    }

    // Start camera if needed AFTER initialization/loading attempt
    if (success && (cameraSettings.cameraMotionEnabled || (cameraVisualizer.getPointsObject()?.visible))) {
        cameraManager.start();
    }
});
// --- Camera Interaction Controls ---
audioCameraFolder.add(cameraSettings, 'cameraMotionEnabled').name('Enable Motion Influence')
    .onChange(async (enabled) => {
        if (enabled) {
            if (cameraSettings.source === 'Webcam') {
                if (!cameraManager.isInitialized || cameraManager.sourceType !== 'webcam') {
                    const success = await cameraManager.initCamera();
                    if (!success) { cameraSettings.cameraMotionEnabled = false; audioCameraFolder.__controllers.find(c => c.property === 'cameraMotionEnabled')?.updateDisplay(); return; }
                } cameraManager.start();
            } else if (cameraSettings.source === 'Video File') {
                if (!cameraManager.isInitialized || cameraManager.sourceType !== 'video') {
                    alert("Please load a video file first."); cameraSettings.cameraMotionEnabled = false; audioCameraFolder.__controllers.find(c => c.property === 'cameraMotionEnabled')?.updateDisplay(); return;
                } cameraManager.start();
            } else { alert("Please select a Camera Source first."); cameraSettings.cameraMotionEnabled = false; audioCameraFolder.__controllers.find(c => c.property === 'cameraMotionEnabled')?.updateDisplay(); return; }
        } else {
            // Stop camera only if visualizer is also not enabled
            const visualizerPoints = cameraVisualizer.getPointsObject();
            if (!visualizerPoints || !visualizerPoints.visible) {
                 cameraManager.stop();
            }
        }
    });

// Camera Visualizer Folder
const visualizerFolder = gui.addFolder('Camera Visualizer');
guiFolders['Visualizer'] = { folder: visualizerFolder }; // Register folder
const visualizerSettings = {
    enableVisualizer: cameraVisualizer.options.visible,
    // Proxy objects/values for GUI control linking
    position: { x: cameraVisualizer.options.position.x, y: cameraVisualizer.options.position.y, z: cameraVisualizer.options.position.z },
    rotation: { x: THREE.MathUtils.radToDeg(cameraVisualizer.options.rotation.x), y: THREE.MathUtils.radToDeg(cameraVisualizer.options.rotation.y), z: THREE.MathUtils.radToDeg(cameraVisualizer.options.rotation.z) },
    scale: { x: cameraVisualizer.options.scale.x, y: cameraVisualizer.options.scale.y, z: cameraVisualizer.options.scale.z },
    particleSize: cameraVisualizer.options.particleSize,
    depthScale: cameraVisualizer.options.depthScale,
    colorMode: cameraVisualizer.options.colorMode,
    particleFadeSpeed: cameraVisualizer.options.particleFadeSpeed,
    particleRandomMotion: cameraVisualizer.options.particleRandomMotion,
};

// Enable/Disable Toggle
visualizerFolder.add(visualizerSettings, 'enableVisualizer').name('Enable Visualization')
    .onChange(async (enabled) => {
        if (enabled) {
            // Check for source first
            if (cameraSettings.source === 'None') {
                alert("Please select a Camera Source first.");
                visualizerSettings.enableVisualizer = false;
                visualizerFolder.__controllers.find(c => c.property === 'enableVisualizer')?.updateDisplay();
                return;
            }
            // Ensure source is ready (init if webcam, check if video loaded)
            if (cameraSettings.source === 'Webcam') {
                if (!cameraManager.isInitialized || cameraManager.sourceType !== 'webcam') {
                    const success = await cameraManager.initCamera();
                    if (!success) { visualizerSettings.enableVisualizer = false; visualizerFolder.__controllers.find(c => c.property === 'enableVisualizer')?.updateDisplay(); return; }
                }
            } else if (cameraSettings.source === 'Video File') {
                if (!cameraManager.isInitialized || cameraManager.sourceType !== 'video') {
                    alert("Please load a video file first."); visualizerSettings.enableVisualizer = false; visualizerFolder.__controllers.find(c => c.property === 'enableVisualizer')?.updateDisplay(); return;
                }
            }
            // Initialize visualizer if needed, then set visible and start camera
            if (!cameraVisualizer.isInitialized) {
                cameraVisualizer.init();
                // Re-add transform controls if init was deferred
                addVisualizerTransformControls();
            }
            cameraVisualizer.setVisible(true);
            cameraManager.start(); // Start camera processing if not already running
            setVisualizerControlsState(true); // Enable controls

        } else {
            cameraVisualizer.setVisible(false);
            setVisualizerControlsState(false); // Disable controls
            // Stop camera only if motion influence is also disabled
            if (!cameraSettings.cameraMotionEnabled) {
                cameraManager.stop();
            }
        }
    });

// --- Add Transform Controls (conditionally) ---
let visualizerControls = []; // Store controllers to enable/disable
function addVisualizerTransformControls() {
    const points = cameraVisualizer.getPointsObject();
    if (!points) return; // Don't add if points object doesn't exist yet

    // Clear previous controls if re-adding
    visualizerControls.forEach(c => {
        try { visualizerFolder.remove(c); } catch (e) { /* ignore */ }
    });
    visualizerControls = [];

    // Position
    const posFolder = visualizerFolder.addFolder('Position');
    visualizerControls.push(posFolder.add(visualizerSettings.position, 'x', -50, 50).step(0.1).onChange(v => points.position.x = v));
    visualizerControls.push(posFolder.add(visualizerSettings.position, 'y', -50, 50).step(0.1).onChange(v => points.position.y = v));
    visualizerControls.push(posFolder.add(visualizerSettings.position, 'z', -50, 50).step(0.1).onChange(v => points.position.z = v));
    visualizerControls.push(posFolder); // Add folder itself to list for enable/disable

    // Rotation (Degrees)
    const rotFolder = visualizerFolder.addFolder('Rotation (Degrees)');
    visualizerControls.push(rotFolder.add(visualizerSettings.rotation, 'x', -180, 180).step(1).onChange(v => points.rotation.x = THREE.MathUtils.degToRad(v)));
    visualizerControls.push(rotFolder.add(visualizerSettings.rotation, 'y', -180, 180).step(1).onChange(v => points.rotation.y = THREE.MathUtils.degToRad(v)));
    visualizerControls.push(rotFolder.add(visualizerSettings.rotation, 'z', -180, 180).step(1).onChange(v => points.rotation.z = THREE.MathUtils.degToRad(v)));
    visualizerControls.push(rotFolder);

    // Scale
    const scaleFolder = visualizerFolder.addFolder('Scale');
    visualizerControls.push(scaleFolder.add(visualizerSettings.scale, 'x', 0.1, 10).step(0.1).onChange(v => points.scale.x = v));
    visualizerControls.push(scaleFolder.add(visualizerSettings.scale, 'y', 0.1, 10).step(0.1).onChange(v => points.scale.y = v));
    visualizerControls.push(scaleFolder.add(visualizerSettings.scale, 'z', 0.1, 10).step(0.1).onChange(v => points.scale.z = v));
    visualizerControls.push(scaleFolder);

    // Other Visualizer Controls
    const colorModes = ['brightness', 'color', 'fftLow', 'fftMid', 'fftHigh', 'fftSpectrum'];
    visualizerControls.push(visualizerFolder.add(visualizerSettings, 'colorMode', colorModes).name('Color Mode').onChange(val => cameraVisualizer.setColorMode(val)));
    visualizerControls.push(visualizerFolder.add(visualizerSettings, 'depthScale', 1, 20).name('Depth Scale').onChange(val => cameraVisualizer.setDepthScale(val)));
    visualizerControls.push(visualizerFolder.add(visualizerSettings, 'particleSize', 0.01, 0.5).name('Particle Size').onChange(val => cameraVisualizer.setParticleSize(val)));

    const particleEffectsFolder = visualizerFolder.addFolder('Particle Effects');
    visualizerControls.push(particleEffectsFolder.add(visualizerSettings, 'particleFadeSpeed', 0, 0.5).name('Fade Speed').step(0.01).onChange(val => cameraVisualizer.setParticleFadeSpeed(val)));
    visualizerControls.push(particleEffectsFolder.add(visualizerSettings, 'particleRandomMotion', 0, 1.0).name('Random Motion').step(0.01).onChange(val => cameraVisualizer.setParticleRandomMotion(val)));
    visualizerControls.push(particleEffectsFolder); // Add folder itself to list

    // Set initial state based on whether visualizer is enabled
    setVisualizerControlsState(visualizerSettings.enableVisualizer);
}

// Helper to enable/disable visualizer controls
function setVisualizerControlsState(enabled) {
    visualizerControls.forEach(controlOrFolder => {
        if (!controlOrFolder || !controlOrFolder.domElement) return; // Guard against null/undefined elements

        // Check if it's a folder or a controller
        if (controlOrFolder instanceof dat.GUI) { // It's a folder
            controlOrFolder.__controllers.forEach(controller => {
                if (controller && controller.domElement) {
                    controller.domElement.style.pointerEvents = enabled ? 'auto' : 'none';
                    controller.domElement.style.opacity = enabled ? 1.0 : 0.5;
                }
            });
            // Also toggle folder open/close state visually
            if (enabled) controlOrFolder.open(); else controlOrFolder.close();
        } else { // It's a controller
            controlOrFolder.domElement.style.pointerEvents = enabled ? 'auto' : 'none';
            controlOrFolder.domElement.style.opacity = enabled ? 1.0 : 0.5;
        }
    });
}

// Add controls only if visualizer was initialized immediately (visible: true)
// Otherwise, add them when it's enabled via the toggle.
if (cameraVisualizer.isInitialized) {
    addVisualizerTransformControls();
} else {
    // Add placeholders or leave empty until enabled?
    // Let's add them but keep them disabled initially.
    addVisualizerTransformControls();
    setVisualizerControlsState(false);
}


// Post Processing Folder
const ppFolder = gui.addFolder('Post Processing');
guiFolders['Effects'] = { folder: ppFolder }; // Register folder
ppFolder.add(settings, 'pixelateEnabled').name("Pixelate").onChange(val => pixelatePass.enabled = val);
ppFolder.add(settings, 'pixelSize', 1, 32).step(1).onChange(val => pixelatePass.uniforms.pixelSize.value = val);
ppFolder.add(settings, 'fxaaEnabled').name("FXAA").onChange(val => fxaaPass.enabled = val);
ppFolder.add(settings, 'bloomEnabled').name("Bloom").onChange(val => bloomPass.enabled = val);
ppFolder.add(settings, 'bloomStrength', 0, 3).onChange(val => bloomPass.strength = val);
ppFolder.add(settings, 'bloomThreshold', 0, 1).onChange(val => bloomPass.threshold = val);
ppFolder.add(settings, 'bloomRadius', 0, 1).onChange(val => bloomPass.radius = val);

// Instance Management Folder
const instanceManagement = gui.addFolder('Instances');
guiFolders['Instances'] = { folder: instanceManagement }; // Register folder
instanceManagement.add(settings, 'addGrid').name("Add Grid");
instanceManagement.add(settings, 'addPointCloud').name("Add Point Cloud");
instanceManagement.add(settings, 'addSphere').name("Add Sphere");
instanceManagement.add(settings, 'addTorus').name("Add Torus");
instanceManagement.add(settings, 'addTorusKnot').name("Add Torus Knot");
instanceManagement.add(settings, 'deleteCurrent').name("Delete Selected");

// --- Portal Controls Tab ---
const portalControlsFolder = portalManager.addGuiControls(gui); // Add portal controls to main GUI
guiFolders['Portals'] = { folder: portalControlsFolder }; // Register folder for tab management
addTab('Portals', portalControlsFolder); // Add a tab for Portals


// --- Finalize Tab Setup ---
// Add buttons for registered folders
addTab('Global', globalFolder);
addTab('Sources', audioCameraFolder);
addTab('Visualizer', visualizerFolder); // Add Visualizer tab
addTab('Effects', ppFolder);
addTab('Instances', instanceManagement); // Keep instance management separate
// addTab('Portals', portalControlsFolder); // Already added above for registration

// Activate the first tab initially
switchTab('Global');
// --- End GUI Setup ---


// --- Event Listeners ---

// Hidden Image File Input Listener (for background)
document.getElementById('imageBackgroundInput').addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (event) => {
            settings.imageBackgroundUrl = event.target.result;
            imageControls.urlController.setValue(event.target.result); // Update GUI
            updateBackground(); // Apply the new image
        };
        reader.readAsDataURL(file);
        document.getElementById('imageBackgroundInput').value = ''; // Reset file input
    }
});

// Hidden Audio File Input Listener
document.getElementById('audioInput').addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        audioSettings.lastAudioFileLoaded = file.name;
        try {
            await audioManager.loadAudio(file);
            audioManager.play();
            if (audioSettings.source !== 'Audio File') {
                 audioSettings.source = 'Audio File'; audioSourceController.updateDisplay(); audioFileButtonController.domElement.style.display = 'block';
            }
        } catch (error) {
            console.error("Failed to load or play audio:", error);
            audioSettings.source = 'None'; audioSourceController.updateDisplay(); audioFileButtonController.domElement.style.display = 'none';
        } finally { document.getElementById('audioInput').value = ''; }
    } else {
         if (audioSettings.source === 'Audio File') {
             audioSettings.source = 'None'; audioSourceController.updateDisplay(); audioFileButtonController.domElement.style.display = 'none';
         }
    }
});

// Hidden Video File Input Listener
document.getElementById('videoInput').addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        cameraSettings.lastVideoFileLoaded = file.name;
        try {
            const success = await cameraManager.loadVideo(file);
            if (success) {
                if (cameraSettings.source !== 'Video File') {
                    cameraSettings.source = 'Video File'; cameraSourceController.updateDisplay(); videoFileButtonController.domElement.style.display = 'block';
                }
                // Start camera if motion or visualization is enabled
                const visualizerEnabled = visualizerSettings.enableVisualizer;
                if (cameraSettings.cameraMotionEnabled || visualizerEnabled) {
                     cameraManager.start();
                }
            } else { throw new Error("CameraManager failed to load video."); }
        } catch (error) {
            console.error("Failed to load or start video:", error); alert(`Failed to load video: ${error.message}`);
            cameraSettings.source = 'None'; cameraSourceController.updateDisplay(); videoFileButtonController.domElement.style.display = 'none'; cameraManager.resetSource();
        } finally { document.getElementById('videoInput').value = ''; }
    } else {
         if (cameraSettings.source === 'Video File') {
             cameraSettings.source = 'None'; cameraSourceController.updateDisplay(); videoFileButtonController.domElement.style.display = 'none'; cameraManager.resetSource();
         }
    }
});


// Interaction listeners are now handled within ObjectManager.js

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    pixelatePass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    fxaaPass.uniforms['resolution'].value.set(1 / window.innerWidth, 1 / window.innerHeight);
    updateBackground(); // Update background on resize for gradients and image cover/stretch
    portalManager.onWindowResize(); // Notify PortalManager of resize
});

// --- Core Logic Functions ---

// updateObject logic is now within ObjectManager

// --- Animation Loop ---
let lastTimestamp = 0;
function animate(timestamp) {
    requestAnimationFrame(animate);

    const deltaTime = (timestamp - lastTimestamp) * 0.001 || 0; // Delta time in seconds, handle first frame
    lastTimestamp = timestamp;

    // --- Get Motion Score ---
    let motionScore = 0;
    const visualizerEnabled = visualizerSettings.enableVisualizer;
    // Process frame if either motion influence or visualization is enabled AND camera is running
    if ((cameraSettings.cameraMotionEnabled || visualizerEnabled) && cameraManager.isRunning) {
        // processFrame updates the score internally and prepares data for visualizer
        cameraManager.processFrame();
        motionScore = cameraManager.lastMotionScore; // Get the updated score
    }

    // --- Update Camera Visualization ---
    // Update visualizer if it's enabled AND camera is running
    if (visualizerEnabled && cameraManager.isRunning) {
        cameraVisualizer.update(deltaTime); // Pass deltaTime for frame-rate independent animations
    }
    // Note: Visibility of the points object itself is handled within CameraVisualizer.update/setVisible


    // --- Global Effects (Camera FOV) ---
    if (audioSettings.source !== 'None' && audioManager.audioContext) { // Check audio context exists
        const averageAmplitude = audioManager.getAverageAmplitude('mid');
        const minFOV = 70;
        const maxFOV = 80;
        const amplitudeFactor = THREE.MathUtils.clamp(averageAmplitude / 128, 0, 1);
        const targetFOV = THREE.MathUtils.lerp(minFOV, maxFOV, amplitudeFactor);
        camera.fov = THREE.MathUtils.lerp(camera.fov, targetFOV, Math.min(deltaTime * 5.0, 1.0));
        camera.updateProjectionMatrix();
    }


    // --- Update each managed object ---
    objectManager.instances.forEach(instance => {
        const instanceSettings = instance.userData.settings;

        // Apply Auto-Rotation (if enabled) - BEFORE updating geometry
        if (instanceSettings.autoRotate) {
            instance.rotation.x += instanceSettings.rotationSpeed.x * deltaTime;
            instance.rotation.y += instanceSettings.rotationSpeed.y * deltaTime;
            instance.rotation.z += instanceSettings.rotationSpeed.z * deltaTime;
            // Keep the settings rotation Euler in sync if auto-rotating
            // This prevents the TransformControls from fighting the auto-rotation visually
            // when the object is selected.
            instanceSettings.rotation.copy(instance.rotation);
        }

        // Update geometry based on audio/motion
        objectManager.updateObject(instance, audioManager, motionScore, cameraSettings);
    });

    orbitControls.update(); // Update orbit controls

    // composer.render(); // Render scene with post-processing - Replaced by PortalManager render
    portalManager.render(scene, camera); // Use PortalManager's render method
}

// --- Initialization ---
objectManager.addInstance('grid'); // Add the initial grid
// objectManager.addInstance('pointcloud'); // Optionally add a point cloud initially
// objectManager.addInstance('sphere'); // Optionally add a sphere initially
// objectManager.addInstance('torusknot'); // Optionally add a torus knot initially
objectManager.setupTransformControls(camera, renderer, orbitControls); // Setup controls *after* first instance exists
animate(0); // Start the animation loop
