import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import * as THREE from 'three';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ 
    canvas: document.getElementById('gridCanvas'),
    antialias: true
});
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

// Post-processing setup
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const pixelateShader = {
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
};

const pixelatePass = new ShaderPass(pixelateShader);
composer.addPass(pixelatePass);

// Grid configuration
const gridSize = 64;
const geometry = new THREE.PlaneGeometry(15, 15, gridSize - 1, gridSize - 1);
const material = new THREE.MeshPhongMaterial({
    vertexColors: true,
    wireframe: false,
    flatShading: true,
    emissive: 0x224422,
    specular: 0x448844,
    shininess: 50
});

const grid = new THREE.Mesh(geometry, material);
grid.rotation.x = -Math.PI / 2;
scene.add(grid);

// Initialize vertex colors
const colors = new Float32Array(geometry.attributes.position.count * 3);
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

camera.position.set(20, 25, 20);
camera.lookAt(0, 0, 0);

// Audio processing setup
let audioContext, analyser, dataArray, audioBuffer, source;
const targetHeights = new Float32Array(gridSize * gridSize);
const audioInput = document.getElementById('audioInput');
let maxFrequency = 1;

// Interaction setup
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isDragging = false;

window.addEventListener('mousedown', (e) => {
    isDragging = true;
    handleMouse(e);
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    handleMouse(e);
});

window.addEventListener('mouseup', () => {
    isDragging = false;
});

function handleMouse(e) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(grid);
    
    if (intersects.length > 0) {
        const localPoint = grid.worldToLocal(intersects[0].point.clone());
        const vertices = grid.geometry.attributes.position.array;
        
        for (let i = 0; i < gridSize * gridSize; i++) {
            const x = (i % gridSize) * (15 / (gridSize - 1)) - 7.5;
            const y = Math.floor(i / gridSize) * (15 / (gridSize - 1)) - 7.5;
            const dx = x - localPoint.x;
            const dy = y - localPoint.z;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 1) {
                targetHeights[i] = Math.min(targetHeights[i] + 0.2, 3);
            }
        }
    }
}

// File input handler
audioInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    const reader = new FileReader();

    reader.onload = async function(e) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const arrayBuffer = await reader.result;
        audioContext.decodeAudioData(arrayBuffer, function(buffer) {
            audioBuffer = buffer;
            setupAudioAnalyser();
            playAudio();
        });
    };
    reader.readAsArrayBuffer(file);
});

function setupAudioAnalyser() {
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
}

function playAudio() {
    if (source) source.stop();
    source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    source.start(0);
    source.loop = true;
}

// Animation loop
function updateGrid() {
    if (!analyser) return;

    analyser.getByteFrequencyData(dataArray);
    const vertices = grid.geometry.attributes.position.array;
    const colors = grid.geometry.attributes.color.array;

    maxFrequency = Math.max(...dataArray);

    for (let i = 0; i < gridSize * gridSize; i++) {
        const x = i % gridSize;
        const y = Math.floor(i / gridSize);
        const dataIndex = Math.floor((x + y) / (2 * gridSize) * dataArray.length);
        
        const audioHeight = (dataArray[dataIndex] / maxFrequency) * 3;
        const targetHeight = Math.max(targetHeights[i], audioHeight);
        
        vertices[i * 3 + 2] += (targetHeight - vertices[i * 3 + 2]) * 0.2;
        targetHeights[i] *= 0.98;

        // Green color scheme
        const heightFactor = vertices[i * 3 + 2] / 3;
        colors[i * 3] = heightFactor * 0.2; // Red
        colors[i * 3 + 1] = heightFactor * 0.8 + 0.2; // Green
        colors[i * 3 + 2] = heightFactor * 0.2; // Blue
    }

    grid.geometry.attributes.position.needsUpdate = true;
    grid.geometry.attributes.color.needsUpdate = true;
}

function animate() {
    requestAnimationFrame(animate);
    updateGrid();
    controls.update();
    composer.render();
}

animate();

// Window resize handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    pixelatePass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
});