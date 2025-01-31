import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111); // Dark background
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ 
    canvas: document.getElementById('gridCanvas'),
    antialias: true // Enable antialiasing
});
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // Smooth camera movement
controls.dampingFactor = 0.05;

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

// Grid configuration
const gridSize = 32;
const geometry = new THREE.PlaneGeometry(15, 15, gridSize - 1, gridSize - 1);
const material = new THREE.MeshPhongMaterial({
    vertexColors: true,
    wireframe: false,
    flatShading: true,
    emissive: 0x444444,
    specular: 0x222222,
    shininess: 100
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
    analyser.fftSize = 512; // Higher resolution
    dataArray = new Uint8Array(analyser.frequencyBinCount);
}

function playAudio() {
    if (source) source.stop();
    source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    source.start(0);
    source.loop = true; // Loop the audio
}

// Animation loop
function updateGrid() {
    if (!analyser) return;

    analyser.getByteFrequencyData(dataArray);
    const vertices = grid.geometry.attributes.position.array;
    const colors = grid.geometry.attributes.color.array;

    // Update target heights and colors
    for (let i = 0; i < gridSize * gridSize; i++) {
        const dataIndex = Math.floor(i / (gridSize * gridSize) * dataArray.length);
        targetHeights[i] = (dataArray[dataIndex] / 256) * 2; // Amplify the effect

        // Smooth height transition
        vertices[i * 3 + 2] += (targetHeights[i] - vertices[i * 3 + 2]) * 0.15;

        // Color mapping based on height
        const heightFactor = vertices[i * 3 + 2] / 3;
        colors[i * 3] = 0.2 + heightFactor; // Red
        colors[i * 3 + 1] = 0.3 - heightFactor * 0.5; // Green
        colors[i * 3 + 2] = 0.5 + heightFactor; // Blue
    }

    grid.geometry.attributes.position.needsUpdate = true;
    grid.geometry.attributes.color.needsUpdate = true;
}

function animate() {
    requestAnimationFrame(animate);
    updateGrid();
    controls.update(); // Required for damping
    renderer.render(scene, camera);
}

animate();

// Window resize handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});