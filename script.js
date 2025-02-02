import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import * as dat from 'https://cdn.skypack.dev/dat.gui';
import * as THREE from 'three';

class GridManager {
    constructor(scene) {
        this.scene = scene;
        this.instances = [];
        this.currentInstance = null;
        this.transformControls = null;
        this.gridTemplate = this.createGrid();
        this.currentSettings = null;
    }

    createGrid() {
        const gridSize = 64;
        const geometry = new THREE.PlaneGeometry(15, 15, gridSize - 1, gridSize - 1);
        const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            wireframe: false,
            flatShading: true,
            emissive: 0x224422,
            specular: 0x448844,
            shininess: 50,
        });

        const grid = new THREE.Mesh(geometry, material);
        grid.rotation.x = -Math.PI / 2;
        
        const colors = new Float32Array(geometry.attributes.position.count * 3);
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        grid.userData.targetHeights = new Float32Array(gridSize * gridSize);
        grid.userData.originalPosition = grid.position.clone();
        grid.userData.settings = {
            lowColor: '#003300',
            midColor: '#386b38',
            highColor: '#ff7ec9',
            decayRate: 0.98,
            heightScale: 3,
            colorMapping: 'height',
            wavePattern: 'radial',
            visible: true,
            strengthScale: 1.0,
            position: grid.position.clone(),
            rotation: grid.rotation.clone()
        };

        return grid;
    }

    addInstance() {
        const newGrid = this.gridTemplate.clone();
        newGrid.userData = {
            ...this.gridTemplate.userData,
            settings: {...this.gridTemplate.userData.settings},
            targetHeights: new Float32Array(this.gridTemplate.userData.targetHeights)
        };
        this.scene.add(newGrid);
        this.instances.push(newGrid);
        this.selectInstance(newGrid);
        return newGrid;
    }

    selectInstance(instance) {
        this.currentInstance = instance;
        this.currentSettings = instance.userData.settings;
        if (this.transformControls) {
            this.transformControls.attach(instance);
        }
        updateInstanceGUI();
    }

    setupTransformControls(camera, renderer) {
        this.transformControls = new TransformControls(camera, renderer.domElement);
        this.transformControls.addEventListener('dragging-changed', event => {
            controls.enabled = !event.value;
        });
        this.transformControls.addEventListener('objectChange', () => {
            if (this.currentInstance) {
                this.currentInstance.userData.settings.position.copy(this.currentInstance.position);
                this.currentInstance.userData.settings.rotation.copy(this.currentInstance.rotation);
            }
        });
        this.scene.add(this.transformControls.getHelper());
    }
}

class AudioManager {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.audioBuffer = null;
        this.source = null;
        this.frequencyRanges = {
            low: [20, 250],
            mid: [251, 2000],
            high: [2001, 20000]
        };
    }

    async loadAudio(file) {
        if (this.audioContext) this.audioContext.close();
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        const arrayBuffer = await file.arrayBuffer();
        this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        this.setupAnalyser();
    }

    setupAnalyser() {
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    }

    play() {
        if (this.source) this.source.stop();
        this.source = this.audioContext.createBufferSource();
        this.source.buffer = this.audioBuffer;
        this.source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
        this.source.start(0);
        this.source.loop = true;
    }

    getFrequencyData(range = 'mid') {
        if (!this.analyser) return new Uint8Array();
        this.analyser.getByteFrequencyData(this.dataArray);
        
        const [low, high] = this.frequencyRanges[range];
        const nyquist = this.audioContext.sampleRate / 2;
        const lowIndex = Math.round((low / nyquist) * this.dataArray.length);
        const highIndex = Math.round((high / nyquist) * this.dataArray.length);
        
        return this.dataArray.slice(lowIndex, highIndex);
    }
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ 
    canvas: document.getElementById('gridCanvas'),
    antialias: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

const gridManager = new GridManager(scene);
gridManager.setupTransformControls(camera, renderer);
const audioManager = new AudioManager();

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5,
    0.4,
    0.85
);
composer.addPass(bloomPass);

const fxaaPass = new ShaderPass(FXAAShader);
fxaaPass.uniforms['resolution'].value.set(1 / window.innerWidth, 1 / window.innerHeight);
composer.addPass(fxaaPass);

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

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

const defaultCamPos = [7.5, 7.5, 7.5];

camera.position.set(defaultCamPos[0],defaultCamPos[1],defaultCamPos[2]);
camera.lookAt(0, 0, 0);
const gridSize = 64;
const maxDistance = Math.sqrt(7.5 * 7.5 + 7.5 * 7.5);

const settings = {
    transformMode: 'translate',
    bloomStrength: 1.5,
    bloomThreshold: 0.4,
    bloomRadius: 0.85,
    pixelateEnabled: true,
    fxaaEnabled: true,
    pixelSize: 8,
    lowColor: '#003300',
    midColor: '#00ff00',
    highColor: '#ffffff',
    cloneCurrent: () => gridManager.addInstance(),
    deleteCurrent: () => {
        scene.remove(gridManager.currentInstance);
        gridManager.instances = gridManager.instances.filter(i => i !== gridManager.currentInstance);
        if (gridManager.instances.length > 0) gridManager.selectInstance(gridManager.instances[0]);
    },
    autoOrbit: true // New auto orbit setting
};

const gui = new dat.GUI();
const ppFolder = gui.addFolder('Post Processing');
ppFolder.add(settings, 'pixelateEnabled').name("Pixelate").onChange(val => {
    pixelatePass.enabled = val;
});
ppFolder.add(settings, 'fxaaEnabled').name("FXAA").onChange(val => {
    fxaaPass.enabled = val;
});
ppFolder.add(bloomPass, 'enabled').name("Bloom");
ppFolder.add(settings, 'bloomStrength', 0, 3).onChange(val => bloomPass.strength = val);
ppFolder.add(settings, 'bloomThreshold', 0, 1).onChange(val => bloomPass.threshold = val);
ppFolder.add(settings, 'bloomRadius', 0, 1).onChange(val => bloomPass.radius = val);

const transformFolder = gui.addFolder('Transform Controls');
transformFolder.add(settings, 'transformMode', ['translate', 'rotate', 'scale'])
    .onChange(val => gridManager.transformControls.setMode(val));
transformFolder.add(settings, 'autoOrbit').name("Auto Orbit"); // New auto orbit switch

const instanceFolder = gui.addFolder('Instance Settings');
let instanceControllers = [];

// Add the strength scale slider to the instance settings
function updateInstanceGUI() {
    instanceControllers.forEach(ctrl => instanceFolder.remove(ctrl));
    instanceControllers = [];

    if (!gridManager.currentInstance) return;

    instanceControllers.push(
        instanceFolder.addColor(gridManager.currentSettings, 'lowColor').name('Low Color'),
        instanceFolder.addColor(gridManager.currentSettings, 'midColor').name('Mid Color'),
        instanceFolder.addColor(gridManager.currentSettings, 'highColor').name('High Color'),
        instanceFolder.add(gridManager.currentSettings, 'heightScale', 0.5, 5)
            .name("Height Scale").step(0.1),
        instanceFolder.add(gridManager.currentSettings, 'colorMapping', ['height', 'audio', 'combined'])
            .name("Color Mapping"),
        instanceFolder.add(gridManager.currentSettings, 'wavePattern', ['radial', 'linear', 'random'])
            .name("Wave Pattern"),
        instanceFolder.add(gridManager.currentSettings, 'visible').name("Visible")
            .onChange(val => gridManager.currentInstance.visible = val),
        instanceFolder.add(gridManager.currentSettings, 'decayRate', 0.9, 0.999)
            .name("Decay Rate").step(0.001),
        instanceFolder.add(gridManager.currentSettings, 'strengthScale', 0.01, 1.0)
            .name("Strength Scale").step(0.1) // New strength scale slider
    );
    instanceFolder.open();
}

const visualFolder = gui.addFolder('Global Visuals');
visualFolder.add(settings, 'pixelSize', 1, 16).step(1).onChange(val => {
    pixelatePass.uniforms.pixelSize.value = val;
});

const instanceManagement = gui.addFolder('Instance Management');
instanceManagement.add(settings, 'cloneCurrent').name("Clone Current");
instanceManagement.add(settings, 'deleteCurrent').name("Delete Current");

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isDragging = false;

document.getElementById('audioInput').addEventListener('change', async (e) => {
    await audioManager.loadAudio(e.target.files[0]);
    audioManager.play();
});

window.addEventListener('mousedown', (e) => handleMouseStart(e));
window.addEventListener('mousemove', (e) => handleMouseMove(e));
window.addEventListener('mouseup', () => isDragging = false);

function handleMouseStart(e) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(gridManager.instances);
    
    if (intersects.length > 0) {
        gridManager.selectInstance(intersects[0].object);
        isDragging = true;
    }
}

function handleMouseMove(e) {
    if (isDragging || !gridManager.currentInstance) return;
    
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(gridManager.currentInstance);
    
    if (intersects.length > 0) {
        const localPoint = gridManager.currentInstance.worldToLocal(intersects[0].point.clone());
        modifyGrid(gridManager.currentInstance, localPoint);
    }
}

// Modify the modifyGrid function to use the strength scale
function modifyGrid(grid, point) {
    const vertices = grid.geometry.attributes.position.array;
    const strengthScale = grid.userData.settings.strengthScale || 1.0; // Default to 1.0 if not set

    for (let i = 0; i < gridSize * gridSize; i++) {
        const x = (i % gridSize) * (15 / (gridSize - 1)) - 7.5;
        const z = Math.floor(i / gridSize) * (15 / (gridSize - 1)) - 7.5;
        const dx = x - point.x;
        const dz = z - point.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance < 1.5) {
            const falloff = 1 - (distance / 1.5);
            const strength = falloff * 0.2 * strengthScale;
            grid.userData.targetHeights[i] = Math.min(grid.userData.targetHeights[i] + strength, 5);
        }
    }
}


function updateGrid(grid) {
    const settings = grid.userData.settings; // Use grid's own settings
    const frequencyData = audioManager.getFrequencyData('mid');
    const vertices = grid.geometry.attributes.position.array;
    const colors = grid.geometry.attributes.color.array;
    const lowColor = new THREE.Color(settings.lowColor);
    const midColor = new THREE.Color(settings.midColor);
    const highColor = new THREE.Color(settings.highColor);

    for (let i = 0; i < gridSize * gridSize; i++) {
        const x = (i % gridSize) * (15 / (gridSize - 1)) - 7.5;
        const z = Math.floor(i / gridSize) * (15 / (gridSize - 1)) - 7.5;
        let audioValue = 0;

        switch(settings.wavePattern) {
            case 'radial':
                const distance = Math.sqrt(x*x + z*z);
                audioValue = frequencyData[Math.floor((distance / maxDistance) * frequencyData.length)] || 0;
                break;
            case 'linear':
                audioValue = frequencyData[i % frequencyData.length] || 0;
                break;
            case 'random':
                audioValue = frequencyData[Math.floor(Math.random() * frequencyData.length)] || 0;
                break;
        }

        const audioHeight = (audioValue / 255) * settings.heightScale; 
        vertices[i * 3 + 2] = Math.max(grid.userData.targetHeights[i], audioHeight);
        grid.userData.targetHeights[i] *= settings.decayRate;

        let colorFactor;
        switch(settings.colorMapping) {
            case 'height':
                colorFactor = vertices[i * 3 + 2] / settings.heightScale;
                break;
            case 'audio':
                colorFactor = audioValue / 255;
                break;
            case 'combined':
                colorFactor = (vertices[i * 3 + 2] + audioValue) / (settings.heightScale + 255);
                break;
        }

        const color = colorFactor < 0.5 ? 
            lowColor.clone().lerp(midColor, colorFactor * 2) : 
            midColor.clone().lerp(highColor, (colorFactor - 0.5) * 2);

        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }

    grid.geometry.attributes.position.needsUpdate = true;
    grid.geometry.attributes.color.needsUpdate = true;
}

function animate() {
    requestAnimationFrame(animate);

    if (settings.autoOrbit && gridManager.currentInstance) {
        const orbitSpeed = 0.01; // Adjust the orbit speed as needed
        gridManager.currentInstance.rotation.z += orbitSpeed;
    } else {
        controls.update();
    }

    // Adjust camera zoom based on audio amplitude
    const frequencyData = audioManager.getFrequencyData('mid');
    const averageAmplitude = frequencyData.reduce((sum, value) => sum + value, 0) / frequencyData.length;
    const zoomFactor =  (100 / averageAmplitude); // Adjust the zoom factor as needed
    camera.position.set(defaultCamPos[0] * zoomFactor, defaultCamPos[1] * zoomFactor, defaultCamPos[2] * zoomFactor);
    camera.lookAt(0, 0, 0);

    gridManager.instances.forEach(grid => {
        if (grid.userData.settings.visible) updateGrid(grid);
    });
    composer.render();
}

gridManager.addInstance();
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    pixelatePass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    fxaaPass.uniforms['resolution'].value.set(1 / window.innerWidth, 1 / window.innerHeight);
});