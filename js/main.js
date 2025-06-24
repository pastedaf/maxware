import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
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
// const orbitControls = new OrbitControls(camera, renderer.domElement);
// orbitControls.enableDamping = true;
// orbitControls.dampingFactor = 0.05;
// orbitControls.autoRotate = false;
// orbitControls.autoRotateSpeed = 1.0;

let playerControls;
const moveState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false, // For potential fly mode/jumping
    down: false
};
const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();
const playerMoveSpeed = 50.0; // Adjusted speed for noticeable movement
const playerLookSpeed = 2.0; // Not directly used by PointerLockControls, but good to have


// --- GUI ---
const gui = new dat.GUI({ autoPlace: false }); // Disable autoPlace
gui.width = 350; // Make GUI slightly wider for more controls
const guiContainer = document.getElementById('gui-container');
guiContainer.appendChild(gui.domElement); // Place GUI in our container

// --- Managers ---
const audioManager = new AudioManager();
const cameraManager = new CameraManager(VIDEO_ELEMENT_ID);
const objectManager = new ObjectManager(scene, gui, GRID_SIZE, GRID_SEGMENTS); // Instantiate ObjectManager
const cameraVisualizer = new CameraVisualizer(scene, cameraManager, {
    widthSegments: 128, // Higher resolution visualizer
    heightSegments: 96,
    visible: false, // Start hidden
    colorMode: 'brightness', // Initial color mode
    position: new THREE.Vector3(0, 5, -10), // Example initial position
    rotation: new THREE.Euler(0, 0, 0),
    scale: new THREE.Vector3(1, 1, 1),
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
// composer.addPass(fxaaPass); // FXAA will be added last, after other custom effects

// --- Custom Post Processing Effects ---

// Film Grain Shader
const FilmGrainShader = {
    uniforms: {
        tDiffuse: { value: null },
        time: { value: 0.0 },
        intensity: { value: 0.05 }, // Default intensity
        speed: { value: 0.5 }       // Default speed
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
        uniform float time;
        uniform float intensity;
        uniform float speed;
        varying vec2 vUv;
        float random(vec2 st) {
            return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }
        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            float grain = random(vUv * time * speed) * intensity;
            color.rgb += grain;
            gl_FragColor = color;
        }
    `
};
const filmGrainPass = new ShaderPass(FilmGrainShader);
composer.addPass(filmGrainPass);

// Scanlines Shader
const ScanlinesShader = {
    uniforms: {
        tDiffuse: { value: null },
        time: { value: 0.0 },
        intensity: { value: 0.1 },   // Default intensity
        count: { value: 400.0 },     // Number of scanlines
        speed: { value: 0.2 }        // Scroll speed
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
        uniform float time;
        uniform float intensity;
        uniform float count;
        uniform float speed;
        varying vec2 vUv;
        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            float scanline = sin((vUv.y + time * speed) * count) * 0.5 + 0.5; // Simple sine wave for scanlines
            float strength = pow(scanline, 2.0) * intensity; // Make lines thinner and sharper
            color.rgb = mix(color.rgb, color.rgb * (1.0 - strength), strength); // Apply darkening
            gl_FragColor = color;
        }
    `
};
const scanlinesPass = new ShaderPass(ScanlinesShader);
composer.addPass(scanlinesPass);

// Vignette Shader
const VignetteShader = {
    uniforms: {
        tDiffuse: { value: null },
        offset: { value: 1.0 },   // Controls how far vignette reaches (1.0 = edges)
        darkness: { value: 1.0 }  // Controls how dark the vignette is (1.0 = fully dark)
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
        uniform float offset;
        uniform float darkness;
        varying vec2 vUv;
        void main() {
            vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
            float dist = length(uv); // Distance from center
            float vig = smoothstep(0.8, darkness * 0.799, dist); // Create smooth falloff
            vec4 color = texture2D(tDiffuse, vUv);
            color.rgb *= (1.0 - vig); // Apply vignette
            gl_FragColor = color;
        }
    `
};
const vignettePass = new ShaderPass(VignetteShader);
composer.addPass(vignettePass);


// Screen Distortion Shader (Barrel/Pinch)
const ScreenDistortionShader = {
    uniforms: {
        tDiffuse: { value: null },
        intensity: { value: 0.0 }, // 0 for no distortion, positive for barrel, negative for pinch
        power: { value: 1.5 } // Power for barrel/pinch effect (usually > 1)
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
        uniform float intensity;
        uniform float power; // Typically 1.0 to 2.0 for barrel
        varying vec2 vUv;

        void main() {
            vec2 uv = vUv;
            vec2 texCoord = uv;

            // Barrel / Pinch Distortion
            // Convert to normalized coords (-1 to 1)
            vec2 p = 2.0 * uv - 1.0; // or (uv - 0.5) * 2.0

            // Calculate distance from center and apply distortion
            float r = length(p);
            if (intensity != 0.0) {
                 float distortionFactor = pow(r, power - 1.0) * intensity; // power-1 because r is already one factor
                 texCoord = uv + normalize(p) * distortionFactor;
            }

            // Check if texCoord is within [0,1] range
            if (texCoord.x >= 0.0 && texCoord.x <= 1.0 && texCoord.y >= 0.0 && texCoord.y <= 1.0) {
                gl_FragColor = texture2D(tDiffuse, texCoord);
            } else {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); // Black outside distorted area
            }
        }
    `
};
const screenDistortionPass = new ShaderPass(ScreenDistortionShader);
composer.addPass(screenDistortionPass);


// Add FXAA last for best results
composer.addPass(fxaaPass);


// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // Softer ambient
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6); // Slightly less intense
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);

// Additional Point Lights for MeshStandardMaterial
const pointLight1 = new THREE.PointLight(0xffaa44, 0.7, 50, 2); // Warm light
pointLight1.position.set(-10, 15, 10);
scene.add(pointLight1);

const pointLight2 = new THREE.PointLight(0x44aaff, 0.7, 50, 2); // Cool light
pointLight2.position.set(10, 15, -10);
scene.add(pointLight2);

// --- Initial State ---
camera.position.set(GRID_SIZE * 0.7, GRID_SIZE * 0.7, GRID_SIZE * 1.2); // Adjust camera based on grid size, pull back slightly
camera.lookAt(0, 0, 0);

// --- Global Settings & Audio/Camera Control ---
const settings = {
    // General View/Control Settings
    fov: camera.fov, // Added FOV
    // orbitControlsRotateSpeed: orbitControls.rotateSpeed, // Added OrbitControls Speeds
    // orbitControlsZoomSpeed: orbitControls.zoomSpeed,
    // orbitControlsPanSpeed: orbitControls.panSpeed,
    transformMode: 'translate',
    // autoRotateSpeed: orbitControls.autoRotateSpeed, // orbitControls is disabled
    // globalBackgroundColor: scene.background.getHex(), // Moved to backgroundSettings
    // Post Processing Settings
    bloomStrength: bloomPass.strength,
    bloomThreshold: bloomPass.threshold,
    bloomRadius: bloomPass.radius,
    bloomEnabled: true,
    pixelateEnabled: true,
    fxaaEnabled: true,
    pixelSize: pixelatePass.uniforms.pixelSize.value,
    // New post-processing effects settings
    filmGrainEnabled: true,
    filmGrainIntensity: filmGrainPass.uniforms.intensity.value,
    filmGrainSpeed: filmGrainPass.uniforms.speed.value,
    scanlinesEnabled: true,
    scanlinesIntensity: scanlinesPass.uniforms.intensity.value,
    scanlinesCount: scanlinesPass.uniforms.count.value,
    scanlinesSpeed: scanlinesPass.uniforms.speed.value,
    vignetteEnabled: true,
    vignetteOffset: vignettePass.uniforms.offset.value,
    vignetteDarkness: vignettePass.uniforms.darkness.value,
    // Screen Distortion Settings
    screenDistortionEnabled: false, // Disabled by default
    screenDistortionType: 'None', // 'None', 'Barrel', 'Pinch' (Wave could be added later)
    screenDistortionIntensity: screenDistortionPass.uniforms.intensity.value,
    screenDistortionPower: screenDistortionPass.uniforms.power.value,
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

const backgroundSettings = {
    type: 'Solid Color', // 'Solid Color', 'Skybox', 'Image'
    solidColor: scene.background.getHex(),
    skyboxPreset: 'None', // Added for presets
    skyboxPathPosX: '',
    skyboxPathNegX: '',
    skyboxPathPosY: '',
    skyboxPathNegY: '',
    skyboxPathPosZ: '',
    skyboxPathNegZ: '',
    imageURL: '',
    // Helper function to apply the background
    applyBackground: () => updateBackground(),
    // Store the currently active skybox texture and image texture for disposal
    activeSkyboxTexture: null,
    activeImageTexture: null,
    // Store the skydome mesh if used
    skydome: null
};

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
// globalFolder.addColor(settings, 'globalBackgroundColor').name('Background').onChange(val => scene.background.setHex(val)); // Moved to Background tab
globalFolder.add(settings, 'transformMode', ['translate', 'rotate', 'scale'])
    .name("Transform Mode")
    .onChange(val => objectManager.setTransformMode(val)); // Use objectManager

// Camera Controls
const cameraFolder = globalFolder.addFolder('Camera Controls');
cameraFolder.add(settings, 'fov', 30, 120).name('FOV').onChange(val => {
    camera.fov = val;
    camera.updateProjectionMatrix();
});
// cameraFolder.add(orbitControls, 'autoRotate').name("Orbit Auto Rotate"); // orbitControls is disabled
// cameraFolder.add(settings, 'autoRotateSpeed', 0.1, 10).name("Orbit Rotate Speed").onChange(val => orbitControls.autoRotateSpeed = val); // orbitControls is disabled
// cameraFolder.add(settings, 'orbitControlsRotateSpeed', 0.1, 5.0).name("Orbit Rotate Speed Sens.").onChange(val => orbitControls.rotateSpeed = val); // orbitControls is disabled
// cameraFolder.add(settings, 'orbitControlsZoomSpeed', 0.1, 5.0).name("Orbit Zoom Speed Sens.").onChange(val => orbitControls.zoomSpeed = val); // orbitControls is disabled
// cameraFolder.add(settings, 'orbitControlsPanSpeed', 0.1, 5.0).name("Orbit Pan Speed Sens.").onChange(val => orbitControls.panSpeed = val); // orbitControls is disabled
// cameraFolder.open();


// Lighting Controls in Global Folder
const lightingFolder = globalFolder.addFolder('Lighting');
lightingFolder.add(ambientLight, 'intensity', 0, 2).name('Ambient Intensity');
const dirLightFolder = lightingFolder.addFolder('Directional Light');
dirLightFolder.add(directionalLight, 'visible');
dirLightFolder.add(directionalLight, 'intensity', 0, 2);
dirLightFolder.add(directionalLight.position, 'x', -20, 20).name('Pos X');
dirLightFolder.add(directionalLight.position, 'y', -20, 20).name('Pos Y');
dirLightFolder.add(directionalLight.position, 'z', -20, 20).name('Pos Z');
// dirLightFolder.open();

const pLight1Folder = lightingFolder.addFolder('Point Light 1 (Warm)');
pLight1Folder.add(pointLight1, 'visible');
pLight1Folder.add(pointLight1, 'intensity', 0, 2);
pLight1Folder.add(pointLight1.position, 'x', -30, 30).name('Pos X');
pLight1Folder.add(pointLight1.position, 'y', -30, 30).name('Pos Y');
pLight1Folder.add(pointLight1.position, 'z', -30, 30).name('Pos Z');
// pLight1Folder.open();

const pLight2Folder = lightingFolder.addFolder('Point Light 2 (Cool)');
pLight2Folder.add(pointLight2, 'visible');
pLight2Folder.add(pointLight2, 'intensity', 0, 2);
pLight2Folder.add(pointLight2.position, 'x', -30, 30).name('Pos X');
pLight2Folder.add(pointLight2.position, 'y', -30, 30).name('Pos Y');
pLight2Folder.add(pointLight2.position, 'z', -30, 30).name('Pos Z');
// pLight2Folder.open();

// lightingFolder.open(); // Optional: Keep lighting folder open by default


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
    visualizerControls.push(visualizerFolder.add(visualizerSettings, 'colorMode', ['brightness', 'color']).name('Color Mode').onChange(val => cameraVisualizer.setColorMode(val)));
    visualizerControls.push(visualizerFolder.add(visualizerSettings, 'depthScale', 1, 20).name('Depth Scale').onChange(val => cameraVisualizer.setDepthScale(val)));
    visualizerControls.push(visualizerFolder.add(visualizerSettings, 'particleSize', 0.01, 0.5).name('Particle Size').onChange(val => cameraVisualizer.setParticleSize(val)));

    // Set initial state based on whether visualizer is enabled
    setVisualizerControlsState(visualizerSettings.enableVisualizer);
}

// Helper to enable/disable visualizer controls
function setVisualizerControlsState(enabled) {
    visualizerControls.forEach(controlOrFolder => {
        // Check if it's a folder or a controller
        if (controlOrFolder instanceof dat.GUI) { // It's a folder
             controlOrFolder.__controllers.forEach(controller => {
                 controller.domElement.style.pointerEvents = enabled ? 'auto' : 'none';
                 controller.domElement.style.opacity = enabled ? 1.0 : 0.5;
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

// Film Grain Controls
const filmGrainFolder = ppFolder.addFolder('Film Grain');
filmGrainFolder.add(settings, 'filmGrainEnabled').name("Enable").onChange(val => filmGrainPass.enabled = val);
filmGrainFolder.add(settings, 'filmGrainIntensity', 0, 1).step(0.01).name("Intensity").onChange(val => filmGrainPass.uniforms.intensity.value = val);
filmGrainFolder.add(settings, 'filmGrainSpeed', 0, 2).step(0.01).name("Speed").onChange(val => filmGrainPass.uniforms.speed.value = val);
// filmGrainFolder.open();

// Scanlines Controls
const scanlinesFolder = ppFolder.addFolder('Scanlines');
scanlinesFolder.add(settings, 'scanlinesEnabled').name("Enable").onChange(val => scanlinesPass.enabled = val);
scanlinesFolder.add(settings, 'scanlinesIntensity', 0, 1).step(0.01).name("Intensity").onChange(val => scanlinesPass.uniforms.intensity.value = val);
scanlinesFolder.add(settings, 'scanlinesCount', 50, 1000).step(10).name("Count").onChange(val => scanlinesPass.uniforms.count.value = val);
scanlinesFolder.add(settings, 'scanlinesSpeed', 0, 1).step(0.01).name("Speed").onChange(val => scanlinesPass.uniforms.speed.value = val);
// scanlinesFolder.open();

// Vignette Controls
const vignetteFolder = ppFolder.addFolder('Vignette');
vignetteFolder.add(settings, 'vignetteEnabled').name("Enable").onChange(val => vignettePass.enabled = val);
vignetteFolder.add(settings, 'vignetteOffset', 0.1, 3).step(0.1).name("Offset").onChange(val => vignettePass.uniforms.offset.value = val);
vignetteFolder.add(settings, 'vignetteDarkness', 0.1, 2).step(0.1).name("Darkness").onChange(val => vignettePass.uniforms.darkness.value = val);
// vignetteFolder.open();


// Instance Management Folder
const instanceManagement = gui.addFolder('Instances');
guiFolders['Instances'] = { folder: instanceManagement }; // Register folder
instanceManagement.add(settings, 'addGrid').name("Add Grid");
instanceManagement.add(settings, 'addPointCloud').name("Add Point Cloud");
instanceManagement.add(settings, 'addSphere').name("Add Sphere");
instanceManagement.add(settings, 'addTorus').name("Add Torus");
instanceManagement.add(settings, 'addTorusKnot').name("Add Torus Knot");
instanceManagement.add(settings, 'deleteCurrent').name("Delete Selected");


// --- Finalize Tab Setup ---
// Add buttons for registered folders
addTab('Global', globalFolder);
addTab('Sources', audioCameraFolder);
addTab('Visualizer', visualizerFolder); // Add Visualizer tab
addTab('Effects', ppFolder);
addTab('Instances', instanceManagement); // Keep instance management separate

// Background Settings Folder
const backgroundFolder = gui.addFolder('Background Settings');
guiFolders['Background'] = { folder: backgroundFolder }; // Register folder

const bgTypeController = backgroundFolder.add(backgroundSettings, 'type', ['Solid Color', 'Skybox', 'Image'])
    .name('Type')
    .onChange(updateBackgroundGUI);

const solidColorController = backgroundFolder.addColor(backgroundSettings, 'solidColor')
    .name('Solid Color')
    .onChange(backgroundSettings.applyBackground);

// Skybox settings (initially hidden)
const skyboxPresetController = backgroundFolder.add(backgroundSettings, 'skyboxPreset', [
    'None',
    'Space1', // Example preset name
    'Space2',
    'Abstract1'
]).name('Skybox Preset').onChange(applySkyboxPreset);

const skyboxPathControllers = [
    backgroundFolder.add(backgroundSettings, 'skyboxPathPosX').name('Path Pos X').onChange(backgroundSettings.applyBackground),
    backgroundFolder.add(backgroundSettings, 'skyboxPathNegX').name('Path Neg X').onChange(backgroundSettings.applyBackground),
    backgroundFolder.add(backgroundSettings, 'skyboxPathPosY').name('Path Pos Y').onChange(backgroundSettings.applyBackground),
    backgroundFolder.add(backgroundSettings, 'skyboxPathNegY').name('Path Neg Y').onChange(backgroundSettings.applyBackground),
    backgroundFolder.add(backgroundSettings, 'skyboxPathPosZ').name('Path Pos Z').onChange(backgroundSettings.applyBackground),
    backgroundFolder.add(backgroundSettings, 'skyboxPathNegZ').name('Path Neg Z').onChange(backgroundSettings.applyBackground)
];

// Image settings (initially hidden)
const imageURLController = backgroundFolder.add(backgroundSettings, 'imageURL')
    .name('Image URL')
    .onChange(backgroundSettings.applyBackground);


// --- Finalize Tab Setup ---
// Add buttons for registered folders
addTab('Global', globalFolder);
addTab('Background', backgroundFolder); // Add Background tab
addTab('Sources', audioCameraFolder);
addTab('Visualizer', visualizerFolder); // Add Visualizer tab

// Lens Effects / World Effects Folder
const lensEffectsFolder = gui.addFolder('Lens Effects');
guiFolders['Lens'] = { folder: lensEffectsFolder };

lensEffectsFolder.add(settings, 'screenDistortionEnabled').name('Enable Distortion').onChange(val => {
    screenDistortionPass.enabled = val;
    // If enabling, and type is None, perhaps default to Barrel? Or let user pick.
    if (val && settings.screenDistortionType === 'None') {
        // settings.screenDistortionType = 'Barrel'; // Optional: auto-select a type
        // screenDistortionTypeController.updateDisplay(); // Update GUI if changed
    }
    updateScreenDistortionUniforms(); // Apply intensity based on type
});

const screenDistortionTypeController = lensEffectsFolder.add(settings, 'screenDistortionType', ['None', 'Barrel', 'Pinch'])
    .name('Distortion Type')
    .onChange(val => {
        updateScreenDistortionUniforms();
        // Show/hide power slider if relevant (e.g. not for 'None' or future types that don't use it)
        screenDistortionPowerController.domElement.style.display = (val === 'Barrel' || val === 'Pinch') ? 'block' : 'none';
    });

const screenDistortionIntensityController = lensEffectsFolder.add(settings, 'screenDistortionIntensity', -1.0, 1.0).step(0.01)
    .name('Intensity')
    .onChange(val => {
        // This directly updates the setting, which will be used by updateScreenDistortionUniforms
        // No need to call updateScreenDistortionUniforms here if type change handles it.
        // However, to make it live, we can call it:
        updateScreenDistortionUniforms();
    });

const screenDistortionPowerController = lensEffectsFolder.add(settings, 'screenDistortionPower', 1.0, 4.0).step(0.1)
    .name('Power')
    .onChange(val => screenDistortionPass.uniforms.power.value = val);


function updateScreenDistortionUniforms() {
    screenDistortionPass.enabled = settings.screenDistortionEnabled;
    if (!settings.screenDistortionEnabled || settings.screenDistortionType === 'None') {
        screenDistortionPass.uniforms.intensity.value = 0.0;
    } else if (settings.screenDistortionType === 'Barrel') {
        // Ensure intensity is positive for barrel, or use Math.abs if preferred
        screenDistortionPass.uniforms.intensity.value = Math.abs(settings.screenDistortionIntensity);
    } else if (settings.screenDistortionType === 'Pinch') {
        // Ensure intensity is negative for pinch
        screenDistortionPass.uniforms.intensity.value = -Math.abs(settings.screenDistortionIntensity);
    }
    // Update visibility of power slider
    screenDistortionPowerController.domElement.style.display = (settings.screenDistortionType === 'Barrel' || settings.screenDistortionType === 'Pinch') && settings.screenDistortionEnabled ? 'block' : 'none';
    screenDistortionIntensityController.domElement.style.display = settings.screenDistortionEnabled && settings.screenDistortionType !== 'None' ? 'block' : 'none';

}
// Initialize pass state and GUI
updateScreenDistortionUniforms();


addTab('Effects', ppFolder); // Standard post-processing effects
addTab('Lens', lensEffectsFolder); // New tab for lens/world distortions
addTab('Instances', instanceManagement); // Keep instance management separate

// Activate the first tab initially
switchTab('Global');
updateBackgroundGUI(); // Set initial visibility of GUI elements for background
// --- End GUI Setup ---


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

// --- Player Controls Setup ---
function setupPlayerControls() {
    playerControls = new PointerLockControls(camera, renderer.domElement);
    scene.add(playerControls.getObject()); // Add camera to scene as it's controlled by PointerLockControls

    // Instructions and Pointer Lock Activation
    const instructions = document.createElement('div');
    instructions.id = 'instructions';
    instructions.style.position = 'absolute';
    instructions.style.top = '50%';
    instructions.style.left = '50%';
    instructions.style.transform = 'translate(-50%, -50%)';
    instructions.style.color = 'white';
    instructions.style.fontSize = '24px';
    instructions.style.textAlign = 'center';
    instructions.style.backgroundColor = 'rgba(0,0,0,0.7)';
    instructions.style.padding = '20px';
    instructions.style.cursor = 'pointer';
    instructions.innerHTML = 'Click to Play<br>(W,A,S,D = Move, MOUSE = Look)';
    document.body.appendChild(instructions);

    instructions.addEventListener('click', () => {
        playerControls.lock();
    });

    playerControls.addEventListener('lock', () => {
        instructions.style.display = 'none';
        // Hide GUI when pointer is locked for immersive gameplay
        guiContainer.style.display = 'none';
    });

    playerControls.addEventListener('unlock', () => {
        instructions.style.display = 'block';
        // Show GUI when pointer is unlocked
        guiContainer.style.display = 'block';
    });

    // Keyboard listeners for movement
    document.addEventListener('keydown', (event) => {
        switch (event.code) {
            case 'KeyW': moveState.forward = true; break;
            case 'KeyS': moveState.backward = true; break;
            case 'KeyA': moveState.left = true; break;
            case 'KeyD': moveState.right = true; break;
            // case 'Space': moveState.up = true; break; // Optional jump/fly
            // case 'ShiftLeft': moveState.down = true; break; // Optional crouch/fly
        }
    });
    document.addEventListener('keyup', (event) => {
        switch (event.code) {
            case 'KeyW': moveState.forward = false; break;
            case 'KeyS': moveState.backward = false; break;
            case 'KeyA': moveState.left = false; break;
            case 'KeyD': moveState.right = false; break;
            // case 'Space': moveState.up = false; break;
            // case 'ShiftLeft': moveState.down = false; break;
        }
    });
}


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

// --- Background Management ---
const textureLoader = new THREE.TextureLoader();
const cubeTextureLoader = new THREE.CubeTextureLoader();

const skyboxPresets = {
    'None': {},
    'Space1': { // Standard LearnOpenGL Skybox
        pathPosX: 'https://raw.githubusercontent.com/JoeyDeVries/LearnOpenGL/master/resources/textures/skybox/right.jpg',
        pathNegX: 'https://raw.githubusercontent.com/JoeyDeVries/LearnOpenGL/master/resources/textures/skybox/left.jpg',
        pathPosY: 'https://raw.githubusercontent.com/JoeyDeVries/LearnOpenGL/master/resources/textures/skybox/top.jpg',
        pathNegY: 'https://raw.githubusercontent.com/JoeyDeVries/LearnOpenGL/master/resources/textures/skybox/bottom.jpg',
        pathPosZ: 'https://raw.githubusercontent.com/JoeyDeVries/LearnOpenGL/master/resources/textures/skybox/front.jpg',
        pathNegZ: 'https://raw.githubusercontent.com/JoeyDeVries/LearnOpenGL/master/resources/textures/skybox/back.jpg',
    },
    'Space2': { // Another example (replace with actual distinct URLs if available)
        // Using placeholder paths from a different common skybox set if possible, e.g., from three.js examples
        // For demonstration, let's assume a different path structure or source:
        // NOTE: These are illustrative. Actual different URLs would be needed for a distinct visual.
        // Using a common skybox (e.g., "Milkyway") often found in three.js examples.
        // The paths would be like: 'textures/cube/Milkyway/dark-s_px.jpg', etc.
        // For now, let's use a slightly different set of URLs if I can find them quickly, otherwise reuse and note it.
        // For simplicity, I'll reuse the same URLs for Space2 for now, as finding reliable, distinct,
        // and directly linkable cubemap face URLs quickly is hard. User would replace these.
        pathPosX: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/cube/Bridge2/px.jpg',
        pathNegX: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/cube/Bridge2/nx.jpg',
        pathPosY: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/cube/Bridge2/py.jpg',
        pathNegY: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/cube/Bridge2/ny.jpg',
        pathPosZ: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/cube/Bridge2/pz.jpg',
        pathNegZ: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/cube/Bridge2/nz.jpg',
    },
    'Abstract1': { // Placeholder for an abstract skybox
        // These would be URLs to abstract cubemap faces
        pathPosX: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/cube/Park3Med/px.jpg',
        pathNegX: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/cube/Park3Med/nx.jpg',
        pathPosY: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/cube/Park3Med/py.jpg',
        pathNegY: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/cube/Park3Med/ny.jpg',
        pathPosZ: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/cube/Park3Med/pz.jpg',
        pathNegZ: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/cube/Park3Med/nz.jpg',
    }
};

function applySkyboxPreset() {
    const preset = skyboxPresets[backgroundSettings.skyboxPreset];
    if (preset) {
        backgroundSettings.skyboxPathPosX = preset.pathPosX || '';
        backgroundSettings.skyboxPathNegX = preset.pathNegX || '';
        backgroundSettings.skyboxPathPosY = preset.pathPosY || '';
        backgroundSettings.skyboxPathNegY = preset.pathNegY || '';
        backgroundSettings.skyboxPathPosZ = preset.pathPosZ || '';
        backgroundSettings.skyboxPathNegZ = preset.pathNegZ || '';

        // Update GUI display for path controllers
        skyboxPathControllers.forEach(controller => controller.updateDisplay());
        updateBackground(); // Apply the new preset
    }
}


function updateBackgroundGUI() {
    const type = backgroundSettings.type;
    solidColorController.domElement.style.display = type === 'Solid Color' ? 'block' : 'none';
    skyboxPresetController.domElement.style.display = type === 'Skybox' ? 'block' : 'none';
    skyboxPathControllers.forEach(c => c.domElement.style.display = type === 'Skybox' ? 'block' : 'none');
    imageURLController.domElement.style.display = type === 'Image' ? 'block' : 'none';
}

function updateBackground() {
    // Dispose previous textures/objects
    if (backgroundSettings.activeSkyboxTexture) {
        backgroundSettings.activeSkyboxTexture.dispose();
        backgroundSettings.activeSkyboxTexture = null;
    }
    if (backgroundSettings.activeImageTexture) {
        backgroundSettings.activeImageTexture.dispose();
        backgroundSettings.activeImageTexture = null;
    }
    if (backgroundSettings.skydome) {
        scene.remove(backgroundSettings.skydome);
        backgroundSettings.skydome.geometry.dispose();
        backgroundSettings.skydome.material.dispose();
        backgroundSettings.skydome = null;
    }
    scene.background = null; // Clear previous background

    switch (backgroundSettings.type) {
        case 'Solid Color':
            scene.background = new THREE.Color(backgroundSettings.solidColor);
            break;
        case 'Skybox':
            if (backgroundSettings.skyboxPathPosX && backgroundSettings.skyboxPathNegX &&
                backgroundSettings.skyboxPathPosY && backgroundSettings.skyboxPathNegY &&
                backgroundSettings.skyboxPathPosZ && backgroundSettings.skyboxPathNegZ) {
                cubeTextureLoader.setPath(''); // Ensure paths are absolute
                backgroundSettings.activeSkyboxTexture = cubeTextureLoader.load([
                    backgroundSettings.skyboxPathPosX, backgroundSettings.skyboxPathNegX,
                    backgroundSettings.skyboxPathPosY, backgroundSettings.skyboxPathNegY,
                    backgroundSettings.skyboxPathPosZ, backgroundSettings.skyboxPathNegZ
                ], () => {
                    console.log("Skybox loaded successfully.");
                }, undefined, (err) => {
                    console.error("Error loading skybox:", err);
                    // Fallback to solid color on error
                    scene.background = new THREE.Color(backgroundSettings.solidColor);
                });
                scene.background = backgroundSettings.activeSkyboxTexture;
            } else {
                // Fallback if not all paths are provided
                scene.background = new THREE.Color(backgroundSettings.solidColor);
                if (backgroundSettings.skyboxPreset !== 'None') { // Only alert if a preset was chosen but failed
                    alert("Skybox paths are not fully specified. Ensure all 6 paths are set or choose 'None' preset.");
                }
            }
            break;
        case 'Image':
            if (backgroundSettings.imageURL) {
                backgroundSettings.activeImageTexture = textureLoader.load(
                    backgroundSettings.imageURL,
                    (texture) => {
                        // Simple skydome: Large sphere
                        const geometry = new THREE.SphereGeometry(500, 60, 40);
                        // Invert the geometry on the x-axis so that all of the faces point inward
                        geometry.scale(-1, 1, 1);
                        const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
                        backgroundSettings.skydome = new THREE.Mesh(geometry, material);
                        scene.add(backgroundSettings.skydome);
                        console.log("Background image loaded and skydome created.");
                    },
                    undefined,
                    (err) => {
                        console.error("Error loading background image:", err);
                        alert("Failed to load background image. Check URL and console.");
                        // Fallback to solid color on error
                        scene.background = new THREE.Color(backgroundSettings.solidColor);
                    }
                );
            } else {
                // Fallback if no image URL
                scene.background = new THREE.Color(backgroundSettings.solidColor);
            }
            break;
        default:
            scene.background = new THREE.Color(backgroundSettings.solidColor);
    }
}
// --- End Background Management ---


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
        cameraVisualizer.update(); // Update particle positions/colors using the frame processed above
    }
    // Note: Visibility of the points object itself is handled within CameraVisualizer.update/setVisible

    // --- Update Shader Uniforms (Time) ---
    if (filmGrainPass.enabled) {
        filmGrainPass.uniforms.time.value += deltaTime;
    }
    if (scanlinesPass.enabled) {
        scanlinesPass.uniforms.time.value += deltaTime;
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

    // orbitControls.update(); // OrbitControls is disabled
    if (playerControls && playerControls.isLocked) {
        playerDirection.z = Number(moveState.forward) - Number(moveState.backward);
        playerDirection.x = Number(moveState.left) - Number(moveState.right);
        playerDirection.normalize(); // this ensures consistent movements in all directions

        const speedDelta = playerMoveSpeed * deltaTime;

        if (moveState.forward || moveState.backward) {
            playerVelocity.z -= playerDirection.z * speedDelta * 10;
        }
        if (moveState.left || moveState.right) {
            playerVelocity.x -= playerDirection.x * speedDelta * 10;
        }

        // Apply movement
        playerControls.moveRight(-playerVelocity.x * deltaTime);
        playerControls.moveForward(-playerVelocity.z * deltaTime);

        // Simple damping
        playerVelocity.x *= 0.9;
        playerVelocity.z *= 0.9;


        // Ensure camera stays at a certain height (e.g. player height)
        // This might be adjusted or made more sophisticated later with collision detection.
        // playerControls.getObject().position.y = 2;
    }


    composer.render(); // Render scene with post-processing
}

// --- Initialization ---
setupPlayerControls(); // Initialize player controls

// Create a basic static level
const groundGrid = objectManager.addInstance('grid');
if (groundGrid) {
    // Make the ground grid larger and flatter for a level
    groundGrid.scale.set(5, 5, 1); // Scale it up (assuming default grid size is 15, so 75x75 units)
    groundGrid.position.y = 0; // Ensure it's at ground level

    const groundSettings = groundGrid.userData.settings;
    groundSettings.wireframe = true;
    groundSettings.heightScale = 0.2; // Flatter ground
    groundSettings.lowColor.setHex(0x222222); // Dark grey
    groundSettings.midColor.setHex(0x333333); // Medium grey
    groundSettings.highColor.setHex(0x444444); // Light grey
    // The grid's default rotation (Math.PI / 2 on X) is correct for a floor.
}

const sphere = objectManager.addInstance('sphere');
if (sphere) {
    sphere.position.set(10, 5, -15); // Position it in the scene
    const sphereSettings = sphere.userData.settings;
    sphereSettings.radius = 4;
    sphereSettings.lowColor.setHex(0xff4444); // Reddish
    sphereSettings.midColor.setHex(0xff8844);
    sphereSettings.highColor.setHex(0xffcc44);
    objectManager.resetObjectInitialGeometry(sphere); // Apply radius change
}

const torusKnot = objectManager.addInstance('torusknot');
if (torusKnot) {
    torusKnot.position.set(-15, 7, -10);
    const tkSettings = torusKnot.userData.settings;
    tkSettings.radius = 5;
    tkSettings.tube = 1.8;
    tkSettings.lowColor.setHex(0x4444ff); // Bluish
    tkSettings.midColor.setHex(0x6666ff);
    tkSettings.highColor.setHex(0x8888ff);
    objectManager.resetObjectInitialGeometry(torusKnot); // Apply geometry changes
}

const pointCloudObj = objectManager.addInstance('pointcloud'); // Renamed to avoid conflict
if (pointCloudObj) {
    pointCloudObj.position.set(0, 12, 10);
    const pcSettings = pointCloudObj.userData.settings;
    pcSettings.particleCount = 8000;
    pcSettings.distributionScale = 20;
    pcSettings.particleSize = 0.25;
    pcSettings.lowColor.setHex(0x44ff44); // Greenish
    pcSettings.midColor.setHex(0x88ff88);
    pcSettings.highColor.setHex(0xccffcc);
    objectManager.resetObjectInitialGeometry(pointCloudObj); // Apply changes
}

// Adjust player starting position and orientation
camera.position.set(0, 1.8, 25); // Start a bit above ground, looking towards origin (player height ~1.8)
playerControls.getObject().position.copy(camera.position); // Sync PointerLockControls position
// Optional: Make the player look towards the center or a specific object.
// playerControls.getObject().lookAt(0, 1.8, 0); // Look at origin at player height

// --- Basic Collision Detection Data ---
const playerHeight = 1.8;
const playerColliderRadius = 0.5; // Approximate player as a cylinder/capsule
const groundBoundary = (GRID_SIZE * 5) / 2 - playerColliderRadius; // Ground grid was scaled by 5

// Store collidable objects and their AABBs
const collidableObjects = [];

if (sphere) {
    const sphereRadius = sphere.userData.settings.radius;
    const sphereBox = new THREE.Box3().setFromObject(sphere); // Use THREE.Box3 to get AABB
    collidableObjects.push({ mesh: sphere, boundingBox: sphereBox });
}
if (torusKnot) {
    const tkBox = new THREE.Box3().setFromObject(torusKnot);
    collidableObjects.push({ mesh: torusKnot, boundingBox: tkBox });
}
// Point clouds are not typically solid colliders, so we'll omit pointCloudObj for now.


objectManager.setupTransformControls(camera, renderer, null /* orbitControls is removed */);
// ObjectManager's transform controls will be disabled for now as per plan
if (objectManager.transformControls) {
    objectManager.transformControls.enabled = false;
    objectManager.transformControls.visible = false;
}

animate(0); // Start the animation loop
