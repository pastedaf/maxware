import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import * as dat from 'https://cdn.skypack.dev/dat.gui';
import * as THREE from 'three';



const gui = new dat.GUI();
class GridManager {
    constructor(scene) {
        this.scene = scene;
        this.instances = [];
        this.currentInstance = null;
        this.transformControls = null;
        this.gridTemplate = this.createTemplate();
        this.instanceCount = 0;
        
    }

    createTemplate() {
        const gridSize = 64;
        const geometry = new THREE.PlaneGeometry(15, 15, gridSize - 1, gridSize - 1);
        
        const colors = new Float32Array(geometry.attributes.position.count * 3);
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            wireframe: false,
            flatShading: true,
            emissive: 0x224422,
            specular: 0x448844,
            shininess: 50,
        });

        return {
            geometry,
            material,
            defaultSettings: {
                audioInfluence: 0.5,
                decayRate: 0.98,
                heightScale: 3,
                colorMapping: 'height',
                wavePattern: 'radial',
                visible: true,
                lowColor: new THREE.Color(0x003300),
                midColor: new THREE.Color(0x00ff00),
                highColor: new THREE.Color(0xffffff),
                position: new THREE.Vector3(),
                rotation: new THREE.Euler()
            }
        };
    }

    addInstance(baseInstance = null) {
        const geometry = this.gridTemplate.geometry.clone();
        
        if (!geometry.attributes.color) {
            const colors = new Float32Array(geometry.attributes.position.count * 3);
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }

        geometry.attributes.position = geometry.attributes.position.clone();
        geometry.attributes.position.array = new Float32Array(geometry.attributes.position.array);
        geometry.attributes.color = geometry.attributes.color.clone();
        geometry.attributes.color.array = new Float32Array(geometry.attributes.color.array);

        const material = this.gridTemplate.material.clone();
        
        const grid = new THREE.Mesh(geometry, material);
        grid.rotation.x = -Math.PI / 2;

        const sourceSettings = baseInstance ? baseInstance.userData.settings : this.gridTemplate.defaultSettings;
        grid.userData = {
            targetHeights: new Float32Array(64 * 64),
            settings: {
                audioInfluence: sourceSettings.audioInfluence,
                decayRate: sourceSettings.decayRate,
                heightScale: sourceSettings.heightScale,
                colorMapping: sourceSettings.colorMapping,
                wavePattern: sourceSettings.wavePattern,
                visible: sourceSettings.visible,
                lowColor: sourceSettings.lowColor.clone(),
                midColor: sourceSettings.midColor.clone(),
                highColor: sourceSettings.highColor.clone(),
                position: new THREE.Vector3(),
                rotation: new THREE.Euler()
            },
            guiFolder: null,
            controllers: []
        };

        if (baseInstance) {
            grid.position.copy(baseInstance.position);
            grid.rotation.copy(baseInstance.rotation);
        }
        grid.userData.settings.position.copy(grid.position);
        grid.userData.settings.rotation.copy(grid.rotation);

        this.instanceCount++;
        const folderName = `Grid ${this.instanceCount}`;
        const guiFolder = gui.addFolder(folderName);
        grid.userData.guiFolder = guiFolder;
        
        const settings = grid.userData.settings;
        grid.userData.controllers.push(
            guiFolder.add(settings, 'audioInfluence', 0, 1).name("Audio Influence").step(0.1),
            guiFolder.add(settings, 'heightScale', 0.5, 5).name("Height Scale").step(0.1),
            guiFolder.add(settings, 'colorMapping', ['height', 'audio', 'combined']).name("Color Mapping"),
            guiFolder.add(settings, 'wavePattern', ['radial', 'linear', 'random']).name("Wave Pattern"),
            guiFolder.add(settings, 'visible').name("Visible").onChange(val => grid.visible = val),
            guiFolder.add(settings, 'decayRate', 0.9, 0.999).name("Decay Rate").step(0.001),
            guiFolder.addColor(
                { 
                    get lowColor() { return settings.lowColor.getHex() }, 
                    set lowColor(v) { settings.lowColor.setHex(v) } 
                }, 'lowColor'
            ).name('Low Color'),
            guiFolder.addColor(
                { 
                    get midColor() { return settings.midColor.getHex() }, 
                    set midColor(v) { settings.midColor.setHex(v) } 
                }, 'midColor'
            ).name('Mid Color'),
            guiFolder.addColor(
                { 
                    get highColor() { return settings.highColor.getHex() }, 
                    set highColor(v) { settings.highColor.setHex(v) } 
                }, 'highColor'
            ).name('High Color')
        );


        guiFolder.open();

        this.scene.add(grid);
        this.instances.push(grid);
        this.selectInstance(grid);
        return grid;
    }

    selectInstance(instance) {
        this.currentInstance = instance;
        if (this.transformControls) {
            this.transformControls.attach(instance);
        }
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
controls.autoRotate = true; // Enable auto-rotation
controls.autoRotateSpeed = 1.0; // Set rotation speed

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

camera.position.set(20, 25, 20);
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
    cloneCurrent: () => gridManager.addInstance(gridManager.currentInstance),
    deleteCurrent: () => {
        if (gridManager.currentInstance) {
            const instance = gridManager.currentInstance;
            scene.remove(instance);
            gridManager.instances = gridManager.instances.filter(i => i !== instance);
            
            // Remove GUI folder
            const guiFolder = instance.userData.guiFolder;
            if (guiFolder) {
                if (guiFolder.__li && guiFolder.__li.parentNode) {
                    guiFolder.__li.parentNode.removeChild(guiFolder.__li);
                }
                const index = gui.__folders.indexOf(guiFolder);
                if (index !== -1) {
                    gui.__folders.splice(index, 1);
                }
            }

            if (gridManager.instances.length > 0) {
                gridManager.selectInstance(gridManager.instances[0]);
            } else {
                gridManager.currentInstance = null;
            }
        }
    }
};

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
transformFolder.add(controls, 'autoRotate').name("Auto Rotate");
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
    if (!isDragging || !gridManager.currentInstance) return;
    
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(gridManager.currentInstance);
    
    if (intersects.length > 0) {
        const localPoint = gridManager.currentInstance.worldToLocal(intersects[0].point.clone());
        modifyGrid(gridManager.currentInstance, localPoint);
    }
}

function modifyGrid(grid, point) {
    const vertices = grid.geometry.attributes.position.array;

    for (let i = 0; i < gridSize * gridSize; i++) {
        const x = (i % gridSize) * (15 / (gridSize - 1)) - 7.5;
        const z = Math.floor(i / gridSize) * (15 / (gridSize - 1)) - 7.5;
        const dx = x - point.x;
        const dz = z - point.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance < 1.5) {
            const falloff = 1 - (distance / 1.5);
            const strength = falloff * 0.2;
            grid.userData.targetHeights[i] = Math.min(grid.userData.targetHeights[i] + strength, 5);
        }
    }
}

function updateGrid(grid) {
    const settings = grid.userData.settings;
    const frequencyData = audioManager.getFrequencyData('mid');
    const vertices = grid.geometry.attributes.position.array;
    const colors = grid.geometry.attributes.color.array;

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

        const audioHeight = (audioValue / 255) * settings.heightScale * settings.audioInfluence;
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
            settings.lowColor.clone().lerp(settings.midColor, colorFactor * 2) : 
            settings.midColor.clone().lerp(settings.highColor, (colorFactor - 0.5) * 2);

        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }

    grid.geometry.attributes.position.needsUpdate = true;
    grid.geometry.attributes.color.needsUpdate = true;
}

function animate() {
    requestAnimationFrame(animate);
    gridManager.instances.forEach(grid => {
        if (grid.userData.settings.visible) updateGrid(grid);
    });
    controls.update();
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