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
// const VERTICES_PER_SIDE = GRID_SEGMENTS + 1; // Calculated in GridManager
// const TOTAL_VERTICES = VERTICES_PER_SIDE * VERTICES_PER_SIDE; // Calculated in GridManager

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
const cameraManager = new CameraManager(); // Instantiate CameraManager
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
    source: 'None', // 'File', 'Microphone'
    triggerFileInput: () => {
        document.getElementById('audioInput').click();
    },
    lastFileLoaded: '',
};

// Separate settings object for camera interactions
const cameraSettings = {
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
const sourceController = audioCameraFolder.add(audioSettings, 'source', ['None', 'File', 'Microphone']).name('Audio Source');
const fileButtonController = audioCameraFolder.add(audioSettings, 'triggerFileInput').name('Load Audio File');
fileButtonController.domElement.style.display = audioSettings.source === 'File' ? 'block' : 'none'; // Show initially based on default

sourceController.onChange(async (value) => {
    fileButtonController.domElement.style.display = value === 'File' ? 'block' : 'none'; // Toggle button visibility
    audioManager.stop(); // Stop previous source

    if (value === 'Microphone') {
        try {
            await audioManager.useMicrophone();
        } catch (error) {
            console.error("Failed to start microphone via GUI:", error);
            audioSettings.source = 'None'; // Revert selection on error
            sourceController.updateDisplay(); // Update GUI
        }
    } else if (value === 'File') {
        // If a file was previously loaded, maybe replay it? Or force selection.
        // For now, just trigger the input. If the user cancels, source remains 'File'.
        audioSettings.triggerFileInput();
    }
});

// Camera Interaction Controls
audioCameraFolder.add(cameraSettings, 'cameraMotionEnabled').name('Enable Grid Motion')
    .onChange(async (enabled) => {
        if (enabled) {
            const success = await cameraManager.initCamera();
            if (success) {
                cameraManager.start();
            } else {
                // Revert the toggle if initialization failed
                cameraSettings.cameraMotionEnabled = false;
                 // Find the controller and update its display
                 audioCameraFolder.__controllers.forEach(c => {
                     if (c.property === 'cameraMotionEnabled') c.updateDisplay();
                 });
                 // Also disable visualization if camera failed
                 if (cameraSettings.cameraVisualizationEnabled) {
                     cameraSettings.cameraVisualizationEnabled = false;
                     cameraVisualizer.setVisible(false);
                     audioCameraFolder.__controllers.forEach(c => {
                         if (c.property === 'cameraVisualizationEnabled') c.updateDisplay();
                     });
                 }
            }
        } else {
            cameraManager.stop(); // Stop processing, but keep stream potentially for visualization
            // If visualization is also disabled, we can stop the stream fully
            if (!cameraSettings.cameraVisualizationEnabled) {
                 cameraManager.stopStream(); // Release camera fully
            }
        }
    });

audioCameraFolder.add(cameraSettings, 'cameraVisualizationEnabled').name('Enable Visualization')
    .onChange(async (enabled) => {
        if (enabled) {
            // Try to initialize camera if not already active
            if (!cameraManager.isInitialized || !cameraManager.stream) {
                 const success = await cameraManager.initCamera();
                 if (!success) {
                     cameraSettings.cameraVisualizationEnabled = false;
                     audioCameraFolder.__controllers.forEach(c => {
                         if (c.property === 'cameraVisualizationEnabled') c.updateDisplay();
                     });
                     return; // Exit if camera failed
                 }
            }
            // Start processing if not already running (needed for visualization updates)
             if (!cameraManager.isRunning) {
                 cameraManager.start(); // Start processing frames
             }
            cameraVisualizer.setVisible(true);
        } else {
            cameraVisualizer.setVisible(false);
            // If grid motion is also disabled, stop the camera stream fully
            if (!cameraSettings.cameraMotionEnabled) {
                 cameraManager.stop(); // Stop processing
                 cameraManager.stopStream(); // Release camera fully
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

// Hidden File Input Listener
document.getElementById('audioInput').addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        audioSettings.lastFileLoaded = file.name; // Store filename
        try {
            await audioManager.loadAudio(file);
            audioManager.play();
            // Ensure GUI reflects File source if user selected via button
            if (audioSettings.source !== 'File') {
                 audioSettings.source = 'File';
                 sourceController.updateDisplay();
                 fileButtonController.domElement.style.display = 'block';
            }
        } catch (error) {
            console.error("Failed to load or play audio:", error);
            audioSettings.source = 'None'; // Revert on error
            sourceController.updateDisplay();
            fileButtonController.domElement.style.display = 'none';
            document.getElementById('audioInput').value = ''; // Clear input
        }
    } else {
         // User cancelled file selection
         if (audioSettings.source === 'File') {
             // If source was already File (e.g., clicked button again), revert to None
             // or keep it as File but without playback? Let's revert.
             audioSettings.source = 'None';
             sourceController.updateDisplay();
             fileButtonController.domElement.style.display = 'none';
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
    if (cameraSettings.cameraMotionEnabled && settings.motionInfluenceFactor > 0) {
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
                 tempColor.lerp(settings.lowColor, lowAmp);
                 tempColor.lerp(settings.midColor, midAmp); // Lerp towards mid based on midAmp
                 tempColor.lerp(settings.highColor, highAmp); // Lerp towards high based on highAmp
                 // This approach might need tweaking for good visual results
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

    // --- Get Motion Score (only if enabled) ---
    let motionScore = 0;
    if (cameraSettings.cameraMotionEnabled && cameraManager.isRunning) {
        motionScore = cameraManager.getMotionScore(); // Processes frame internally
    }

    // --- Update Camera Visualization (if enabled) ---
    if (cameraSettings.cameraVisualizationEnabled) {
        // Ensure CameraManager processes a frame if it's not already running for motion detection
        if (!cameraManager.isRunning && cameraManager.isInitialized) {
             cameraManager.processFrame(); // Process frame specifically for visualization
        }
        cameraVisualizer.update(); // Update particle positions/colors
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
