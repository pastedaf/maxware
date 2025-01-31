const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gridCanvas') });

renderer.setSize(window.innerWidth, window.innerHeight);

const gridSize = 20;
const geometry = new THREE.PlaneGeometry(10, 10, gridSize - 1, gridSize - 1);
const material = new THREE.MeshBasicMaterial({ color: 0xcccccc, wireframe: true });
const grid = new THREE.Mesh(geometry, material);

// Rotate the grid to be horizontal
grid.rotation.x = -Math.PI / 2;

scene.add(grid);

camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

function generateHeights() {
    const vertices = grid.geometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
        vertices[i + 2] = Math.random() * 2; // Vary the height (z-coordinate)
    }
    grid.geometry.attributes.position.needsUpdate = true;
}

generateHeights();

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
