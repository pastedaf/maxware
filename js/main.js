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
const gui = new dat.GUI();
gui.width = 300; // Make GUI slightly wider

// --- Managers ---
const audioManager = new AudioManager();
const cameraManager = new CameraManager(VIDEO_ELEMENT_ID);
const objectManager = new ObjectManager(scene, gui, GRID_SIZE, GRID_SEGMENTS); // Instantiate ObjectManager
const cameraVisualizer = new CameraVisualizer(scene, cameraManager, {
    widthSegments: 128,
    heightSegments: 96,
    visible: false,
    colorMode: 'brightness' // Initial color mode
});

// --- Post Processing ---
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
    addGrid: () => objectManager.addInstance('grid'),
    addPointCloud: () => objectManager.addInstance('pointcloud'),
    addSphere: () => objectManager.addInstance('sphere'),
    addTorus: () => objectManager.addInstance('torus'),
    addTorusKnot: () => objectManager.addInstance('torusknot'), // Added
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
    cameraVisualizationEnabled: false,
    visualizationDepthScale: cameraVisualizer.options.depthScale,
    visualizationParticleSize: cameraVisualizer.options.particleSize,
    visualizationColorMode: cameraVisualizer.options.colorMode, // Added
};


// --- GUI Setup ---

// Global Settings Folder
const globalFolder = gui.addFolder('Global Settings');
globalFolder.addColor(settings, 'globalBackgroundColor').name('Background').onChange(val => scene.background.setHex(val));
globalFolder.add(settings, 'transformMode', ['translate', 'rotate', 'scale'])
    .name("Transform Mode")
    .onChange(val => objectManager.setTransformMode(val)); // Use objectManager
globalFolder.add(orbitControls, 'autoRotate').name("Auto Rotate");
globalFolder.add(settings, 'autoRotateSpeed', 0.1, 10).name("Rotate Speed").onChange(val => orbitControls.autoRotateSpeed = val);
// globalFolder.open();

// Audio & Camera Folder
const audioCameraFolder = gui.addFolder('Audio & Camera');
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
    if (value === 'Webcam') {
        const success = await cameraManager.initCamera();
        if (!success) { cameraSettings.source = 'None'; cameraSourceController.updateDisplay(); }
        else if (cameraSettings.cameraMotionEnabled || cameraSettings.cameraVisualizationEnabled) { cameraManager.start(); }
    } else if (value === 'Video File') { cameraSettings.triggerVideoFileInput(); }
    else { // value === 'None'
        cameraManager.resetSource();
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
audioCameraFolder.add(cameraSettings, 'cameraMotionEnabled').name('Enable Motion Influence')
    .onChange(async (enabled) => {
        if (enabled) {
            if (cameraSettings.source === 'Webcam') {
                if (!cameraManager.isInitialized || cameraManager.sourceType !== 'webcam') {
                    const success = await cameraManager.initCamera();
                    if (!success) { cameraSettings.cameraMotionEnabled = false; audioCameraFolder.__controllers.forEach(c => { if (c.property === 'cameraMotionEnabled') c.updateDisplay(); }); return; }
                } cameraManager.start();
            } else if (cameraSettings.source === 'Video File') {
                if (!cameraManager.isInitialized || cameraManager.sourceType !== 'video') {
                    alert("Please load a video file first."); cameraSettings.cameraMotionEnabled = false; audioCameraFolder.__controllers.forEach(c => { if (c.property === 'cameraMotionEnabled') c.updateDisplay(); }); return;
                } cameraManager.start();
            } else { alert("Please select a Camera Source first."); cameraSettings.cameraMotionEnabled = false; audioCameraFolder.__controllers.forEach(c => { if (c.property === 'cameraMotionEnabled') c.updateDisplay(); }); return; }
        } else { if (!cameraSettings.cameraVisualizationEnabled) { cameraManager.stop(); } }
    });
audioCameraFolder.add(cameraSettings, 'cameraVisualizationEnabled').name('Enable Visualization')
    .onChange(async (enabled) => {
        if (enabled) {
            if (cameraSettings.source === 'Webcam') {
                if (!cameraManager.isInitialized || cameraManager.sourceType !== 'webcam') {
                    const success = await cameraManager.initCamera();
                    if (!success) { cameraSettings.cameraVisualizationEnabled = false; audioCameraFolder.__controllers.forEach(c => { if (c.property === 'cameraVisualizationEnabled') c.updateDisplay(); }); return; }
                } cameraManager.start(); cameraVisualizer.setVisible(true);
            } else if (cameraSettings.source === 'Video File') {
                if (!cameraManager.isInitialized || cameraManager.sourceType !== 'video') {
                    alert("Please load a video file first."); cameraSettings.cameraVisualizationEnabled = false; audioCameraFolder.__controllers.forEach(c => { if (c.property === 'cameraVisualizationEnabled') c.updateDisplay(); }); return;
                } cameraManager.start(); cameraVisualizer.setVisible(true);
            } else { alert("Please select a Camera Source first."); cameraSettings.cameraVisualizationEnabled = false; audioCameraFolder.__controllers.forEach(c => { if (c.property === 'cameraVisualizationEnabled') c.updateDisplay(); }); return; }
        } else { cameraVisualizer.setVisible(false); if (!cameraSettings.cameraMotionEnabled) { cameraManager.stop(); } }
    });
// --- Camera Visualizer Controls ---
audioCameraFolder.add(cameraSettings, 'visualizationColorMode', ['brightness', 'color']).name('Vis Color Mode').onChange(val => cameraVisualizer.setColorMode(val)); // Added
audioCameraFolder.add(cameraSettings, 'visualizationDepthScale', 1, 20).name('Vis Depth Scale').onChange(val => cameraVisualizer.setDepthScale(val));
audioCameraFolder.add(cameraSettings, 'visualizationParticleSize', 0.01, 0.5).name('Vis Particle Size').onChange(val => cameraVisualizer.setParticleSize(val));
audioCameraFolder.open();

// Post Processing Folder
const ppFolder = gui.addFolder('Post Processing');
ppFolder.add(settings, 'pixelateEnabled').name("Pixelate").onChange(val => pixelatePass.enabled = val);
ppFolder.add(settings, 'pixelSize', 1, 32).step(1).onChange(val => pixelatePass.uniforms.pixelSize.value = val);
ppFolder.add(settings, 'fxaaEnabled').name("FXAA").onChange(val => fxaaPass.enabled = val);
ppFolder.add(settings, 'bloomEnabled').name("Bloom").onChange(val => bloomPass.enabled = val);
ppFolder.add(settings, 'bloomStrength', 0, 3).onChange(val => bloomPass.strength = val);
ppFolder.add(settings, 'bloomThreshold', 0, 1).onChange(val => bloomPass.threshold = val);
ppFolder.add(settings, 'bloomRadius', 0, 1).onChange(val => bloomPass.radius = val);
// ppFolder.open();

// Instance Management Folder
const instanceManagement = gui.addFolder('Instance Management');
instanceManagement.add(settings, 'addGrid').name("Add Grid");
instanceManagement.add(settings, 'addPointCloud').name("Add Point Cloud");
instanceManagement.add(settings, 'addSphere').name("Add Sphere");
instanceManagement.add(settings, 'addTorus').name("Add Torus");
instanceManagement.add(settings, 'addTorusKnot').name("Add Torus Knot"); // Added
instanceManagement.add(settings, 'deleteCurrent').name("Delete Selected");
instanceManagement.open();

// --- Event Listeners ---

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
                if (cameraSettings.cameraMotionEnabled || cameraSettings.cameraVisualizationEnabled) { cameraManager.start(); }
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
    // Process frame if either motion influence or visualization is enabled AND camera is running
    if ((cameraSettings.cameraMotionEnabled || cameraSettings.cameraVisualizationEnabled) && cameraManager.isRunning) {
        // processFrame updates the score internally and prepares data for visualizer
        cameraManager.processFrame();
        motionScore = cameraManager.lastMotionScore; // Get the updated score
    }

    // --- Update Camera Visualization ---
    // Update visualizer if it's enabled AND camera is running
    if (cameraSettings.cameraVisualizationEnabled && cameraManager.isRunning) {
        cameraVisualizer.update(); // Update particle positions/colors using the frame processed above
    } else if (cameraVisualizer.points && cameraVisualizer.points.visible) {
        // Ensure visualizer is hidden if it shouldn't be running
        cameraVisualizer.setVisible(false);
    }


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
        objectManager.updateObject(instance, audioManager, motionScore, cameraSettings); // Call the manager's update method
    });

    orbitControls.update(); // Update orbit controls

    composer.render(); // Render scene with post-processing
}

// --- Initialization ---
objectManager.addInstance('grid'); // Add the initial grid
// objectManager.addInstance('pointcloud'); // Optionally add a point cloud initially
// objectManager.addInstance('sphere'); // Optionally add a sphere initially
// objectManager.addInstance('torusknot'); // Optionally add a torus knot initially
objectManager.setupTransformControls(camera, renderer, orbitControls); // Setup controls *after* first instance exists
animate(0); // Start the animation loop
