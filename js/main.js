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

// --- Constants ---
const GRID_SIZE = 15; // Physical size
const GRID_SEGMENTS = 63; // Number of segments (vertices = segments + 1)
const VERTICES_PER_SIDE = GRID_SEGMENTS + 1;
const TOTAL_VERTICES = VERTICES_PER_SIDE * VERTICES_PER_SIDE;

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

// --- Managers ---
const audioManager = new AudioManager();
const gridManager = new GridManager(scene, gui, GRID_SIZE, GRID_SEGMENTS);
gridManager.setupTransformControls(camera, renderer.domElement, orbitControls); // Pass orbitControls

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
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

// --- Initial State ---
camera.position.set(GRID_SIZE / 2, GRID_SIZE / 2, GRID_SIZE / 2); // Adjust camera based on grid size
camera.lookAt(0, 0, 0);

// --- Global Settings ---
const settings = {
    transformMode: 'translate',
    bloomStrength: bloomPass.strength,
    bloomThreshold: bloomPass.threshold,
    bloomRadius: bloomPass.radius,
    bloomEnabled: true,
    pixelateEnabled: true,
    fxaaEnabled: true,
    pixelSize: pixelatePass.uniforms.pixelSize.value,
    autoRotateSpeed: orbitControls.autoRotateSpeed,
    cloneCurrent: () => {
        if (gridManager.currentInstance) {
            gridManager.addInstance(gridManager.currentInstance);
        } else {
            gridManager.addInstance(); // Add default if none selected
        }
    },
    deleteCurrent: () => gridManager.deleteCurrent(),
    globalBackgroundColor: scene.background.getHex(),
};

// --- GUI Setup ---
const ppFolder = gui.addFolder('Post Processing');
ppFolder.add(settings, 'pixelateEnabled').name("Pixelate").onChange(val => pixelatePass.enabled = val);
ppFolder.add(settings, 'pixelSize', 1, 32).step(1).onChange(val => pixelatePass.uniforms.pixelSize.value = val);
ppFolder.add(settings, 'fxaaEnabled').name("FXAA").onChange(val => fxaaPass.enabled = val);
ppFolder.add(settings, 'bloomEnabled').name("Bloom").onChange(val => bloomPass.enabled = val);
ppFolder.add(settings, 'bloomStrength', 0, 3).onChange(val => bloomPass.strength = val);
ppFolder.add(settings, 'bloomThreshold', 0, 1).onChange(val => bloomPass.threshold = val);
ppFolder.add(settings, 'bloomRadius', 0, 1).onChange(val => bloomPass.radius = val);
ppFolder.open();

const viewFolder = gui.addFolder('View Controls');
viewFolder.add(settings, 'transformMode', ['translate', 'rotate', 'scale'])
    .name("Transform Mode")
    .onChange(val => gridManager.setTransformMode(val));
viewFolder.add(orbitControls, 'autoRotate').name("Auto Rotate");
viewFolder.add(settings, 'autoRotateSpeed', 0.1, 10).name("Rotate Speed").onChange(val => orbitControls.autoRotateSpeed = val);
viewFolder.addColor(settings, 'globalBackgroundColor').name('Background').onChange(val => scene.background.setHex(val));
viewFolder.open();

const instanceManagement = gui.addFolder('Instance Management');
instanceManagement.add(settings, 'cloneCurrent').name("Clone Current/Add New");
instanceManagement.add(settings, 'deleteCurrent').name("Delete Selected");
instanceManagement.open();

// --- Event Listeners ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isDragging = false; // Used for mouse interaction logic

// Audio Source Selection
document.getElementById('audioInput').addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
        try {
            await audioManager.loadAudio(e.target.files[0]);
            audioManager.play();
        } catch (error) {
            console.error("Failed to load or play audio:", error);
            // Optionally reset UI or provide feedback
             document.getElementById('audioInput').value = ''; // Clear input
             document.querySelector('input[name="audioSource"][value="file"]').checked = false; // Uncheck radio
        }
    }
});

document.querySelectorAll('input[name="audioSource"]').forEach(input => {
    input.addEventListener('change', async (e) => {
        if (e.target.checked) {
            if (e.target.value === 'mic') {
                try {
                    await audioManager.useMicrophone();
                } catch (error) {
                     console.error("Failed to start microphone:", error);
                     e.target.checked = false; // Uncheck if failed
                }
            } else if (e.target.value === 'file') {
                // Stop mic/current playback before opening file dialog
                audioManager.stop();
                document.getElementById('audioInput').click();
            }
        }
    });
});

// Mouse Interaction for Grid Selection / Modification
window.addEventListener('mousedown', (e) => {
    // Prevent interaction if clicking on GUI
    if (e.target.closest('.dg')) return;

    isDragging = true; // Assume dragging starts on mousedown

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(gridManager.instances);

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
    // Re-enable orbit controls if they were disabled by transform controls
    // (The transform controls listener should handle this, but double-check)
    // if (!orbitControls.enabled && !gridManager.transformControls?.dragging) {
    //     orbitControls.enabled = true;
    // }
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
    const size = grid.geometry.parameters.width; // Use actual geometry size
    const segments = grid.geometry.parameters.widthSegments; // Use actual segments
    const verticesPerSide = segments + 1;
    const halfSize = size / 2;

    for (let i = 0; i < targetHeights.length; i++) {
        // Calculate vertex position in local grid space (plane is in XY initially)
        const x = (i % verticesPerSide) * (size / segments) - halfSize;
        const y = Math.floor(i / verticesPerSide) * (size / segments) - halfSize; // Corresponds to Z in world after rotation

        // Use the point's x and y (since grid is rotated to be flat on XZ plane)
        const dx = x - point.x;
        const dy = y - point.y; // Compare with point.y which corresponds to local Z
        const distance = Math.sqrt(dx * dx + dy * dy);

        const modificationRadius = 1.5; // How far the "poke" reaches
        const maxPokeHeight = 5; // Max height added by poking
        const pokeStrength = 0.2; // Amount added per frame on hover

        if (distance < modificationRadius) {
            const falloff = 1 - (distance / modificationRadius);
            const strength = falloff * pokeStrength;
            // Increase target height, but clamp to maxPokeHeight
            targetHeights[i] = Math.min(targetHeights[i] + strength, maxPokeHeight);
        }
    }
    // No need to set needsUpdate here, updateGrid does it every frame
}

function updateGrid(grid) {
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
    // Calculate max distance from center for radial pattern normalization
    const maxDistance = Math.sqrt(halfSize * halfSize + halfSize * halfSize);

    for (let i = 0; i < targetHeights.length; i++) {
        // Calculate vertex position in local grid space (plane is in XY initially)
        const x = (i % verticesPerSide) * (size / segments) - halfSize;
        const y = Math.floor(i / verticesPerSide) * (size / segments) - halfSize; // Corresponds to Z in world after rotation

        let audioValue = 0;
        if (frequencyData.length > 0) {
            switch (settings.wavePattern) {
                case 'radial':
                    const distance = Math.sqrt(x * x + y * y);
                    // Normalize distance and map to frequency data index
                    const normalizedDistance = Math.min(distance / maxDistance, 1.0);
                    const index = Math.floor(normalizedDistance * (frequencyData.length - 1));
                    audioValue = frequencyData[index] || 0;
                    break;
                case 'linear':
                    // Map vertex index linearly to frequency data index
                    audioValue = frequencyData[i % frequencyData.length] || 0;
                    break;
                case 'random':
                    // Assign a random frequency value
                    audioValue = frequencyData[Math.floor(Math.random() * frequencyData.length)] || 0;
                    break;
            }
        }

        // Calculate height based on audio and apply influence/scale
        const audioHeight = (audioValue / 255) * settings.heightScale * settings.audioInfluence;

        // Apply decay to target height (from mouse interaction)
        targetHeights[i] *= settings.decayRate;
        // Prevent target height from becoming excessively small noise
        if (targetHeights[i] < 0.01) targetHeights[i] = 0;

        // Final vertex height is the max of decayed target height and current audio height
        // The vertex array stores X, Y, Z. For PlaneGeometry rotated -PI/2 on X, Z becomes height.
        const finalHeight = Math.max(targetHeights[i], audioHeight);
        vertices[i * 3 + 2] = finalHeight; // Set the Z coordinate (which acts as height)

        // --- Color Calculation ---
        let colorFactor = 0;
        const normalizedHeight = finalHeight / settings.heightScale; // Normalize height relative to scale
        const normalizedAudio = audioValue / 255;

        switch (settings.colorMapping) {
            case 'height':
                colorFactor = THREE.MathUtils.clamp(normalizedHeight, 0, 1);
                break;
            case 'audio':
                colorFactor = THREE.MathUtils.clamp(normalizedAudio, 0, 1);
                break;
            case 'combined':
                // Average normalized height and audio, then clamp
                colorFactor = THREE.MathUtils.clamp((normalizedHeight + normalizedAudio) / 2, 0, 1);
                break;
        }

        // Interpolate color based on the factor
        const color = new THREE.Color();
        if (colorFactor < 0.5) {
            color.lerpColors(settings.lowColor, settings.midColor, colorFactor * 2);
        } else {
            color.lerpColors(settings.midColor, settings.highColor, (colorFactor - 0.5) * 2);
        }

        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }

    grid.geometry.attributes.position.needsUpdate = true;
    grid.geometry.attributes.color.needsUpdate = true;
    grid.geometry.computeVertexNormals(); // Important for lighting on dynamic geometry
}


// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);

    // Get average amplitude for potential global effects (like camera FOV)
    const averageAmplitude = audioManager.getAverageAmplitude('mid'); // Use mid range for FOV effect

    // Adjust camera FOV based on amplitude (subtle effect)
    const minFOV = 65;
    const maxFOV = 85;
    const amplitudeFactor = THREE.MathUtils.clamp(averageAmplitude / 128, 0, 1); // Normalize (0-255 -> 0-1, using 128 as midpoint)
    camera.fov = THREE.MathUtils.lerp(minFOV, maxFOV, amplitudeFactor);
    camera.updateProjectionMatrix();

    // Update each grid instance
    gridManager.instances.forEach(grid => {
        updateGrid(grid); // Pass the grid instance to the update function
    });

    orbitControls.update(); // Update orbit controls (handles damping, auto-rotate)
    // Note: TransformControls are updated implicitly by the renderer/composer

    composer.render(); // Render scene with post-processing
}

// --- Initialization ---
gridManager.addInstance(); // Add the initial grid
animate(); // Start the animation loop
