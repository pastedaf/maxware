import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';


const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gridCanvas') });
const controls = new OrbitControls( camera, renderer.domElement );

renderer.setSize(window.innerWidth, window.innerHeight);

const gridSize = 32;
const geometry = new THREE.PlaneGeometry(10, 10, gridSize - 1, gridSize - 1);
const material = new THREE.MeshBasicMaterial({ color: 0xcccccc, wireframe: true });
const grid = new THREE.Mesh(geometry, material);

// Rotate the grid to be horizontal
grid.rotation.x = -Math.PI / 2;

scene.add(grid);

camera.position.set(0, 10, 10);
camera.lookAt(0, 0, 0);

let audioContext, analyser, dataArray, audioBuffer, source;
const audioInput = document.getElementById('audioInput');

function playAudio() {
    if (audioContext && audioBuffer) {
        source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        source.start(0);
        source.onended = playAudio; // Loop the audio
    }
}

audioInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    const reader = new FileReader();

    reader.onload = function(e) {
        const arrayBuffer = e.target.result;
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioContext.decodeAudioData(arrayBuffer, function(buffer) {
            audioBuffer = buffer;

            analyser = audioContext.createAnalyser();
            analyser.fftSize = 1024;
            const bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);

            playAudio(); // Start playing and looping
        });
    };

    reader.readAsArrayBuffer(file);
});

function updateGridHeights() {
    if (!analyser) return;

    analyser.getByteFrequencyData(dataArray);
    const vertices = grid.geometry.attributes.position.array;

    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            const index = (i * gridSize + j) * 3;
            const dataIndex = Math.floor((i * gridSize + j) / (gridSize * gridSize) * dataArray.length);
            const xOffset = Math.sin(i / gridSize * Math.PI * 2) * 0.5;
            const yOffset = Math.cos(j / gridSize * Math.PI * 2) * 0.5;
            vertices[index + 2] = (dataArray[dataIndex] / 512 * 3 + xOffset + yOffset);
        }
    }

    grid.geometry.attributes.position.needsUpdate = true;
}

function animate() {
    requestAnimationFrame(animate);
    updateGridHeights();
    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
