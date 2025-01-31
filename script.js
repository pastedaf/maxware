const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gridCanvas') });

renderer.setSize(window.innerWidth, window.innerHeight);

const gridSize = 32;
const geometry = new THREE.PlaneGeometry(10, 10, gridSize - 1, gridSize - 1);
const material = new THREE.MeshBasicMaterial({ color: 0xcccccc, wireframe: true });
const grid = new THREE.Mesh(geometry, material);

// Rotate the grid to be horizontal
grid.rotation.x = -Math.PI / 2;

scene.add(grid);

camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

let audioContext, analyser, dataArray;
const audioInput = document.getElementById('audioInput');

audioInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    const reader = new FileReader();

    reader.onload = function(e) {
        const arrayBuffer = e.target.result;
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioContext.decodeAudioData(arrayBuffer, function(buffer) {
            const source = audioContext.createBufferSource();
            source.buffer = buffer;

            analyser = audioContext.createAnalyser();
            analyser.fftSize = 1024;
            const bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);

            source.connect(analyser);
            analyser.connect(audioContext.destination);
            source.start(0);
        });
    };

    reader.readAsArrayBuffer(file);
});

function updateGridHeights() {
    if (!analyser) return;

    analyser.getByteFrequencyData(dataArray);
    const vertices = grid.geometry.attributes.position.array;

    for (let i = 0, j = 0; i < vertices.length; i += 3, j++) {
        const index = Math.floor(j / gridSize * dataArray.length);
        vertices[i + 2] = dataArray[index] / 128 * 3; // Scale the height
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
