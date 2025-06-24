import * as THREE from 'three';

const DEFAULT_PLATFORM_SIZE = new THREE.Vector3(10, 2, 10);
const GOAL_PLATFORM_SIZE = new THREE.Vector3(5, 1, 5);
const PLATFORM_MATERIAL_TYPE = 'MeshPhongMaterial'; // Or whatever default you prefer

export class LevelGenerator {
    constructor(options = {}) {
        this.options = {
            numberOfPlatforms: options.numberOfPlatforms || 15,
            minPlatformDistance: options.minPlatformDistance || 8,
            maxPlatformDistance: options.maxPlatformDistance || 20,
            minHeightVariation: options.minHeightVariation || -5,
            maxHeightVariation: options.maxHeightVariation || 7,
            maxAngleChange: options.maxAngleChange || Math.PI / 4, // Max 45-degree turn from previous
            startPosition: options.startPosition || new THREE.Vector3(0, 0, 0),
            mainDirection: options.mainDirection || new THREE.Vector3(0, 0, -1), // Default towards negative Z
            platformSize: options.platformSize || DEFAULT_PLATFORM_SIZE.clone(),
            goalPlatformSize: options.goalPlatformSize || GOAL_PLATFORM_SIZE.clone(),
        };
        this.levelObjects = [];
    }

    generateLevel() {
        this.levelObjects = [];
        let currentPosition = this.options.startPosition.clone();
        let currentDirection = this.options.mainDirection.clone().normalize();

        // Create starting platform
        this.levelObjects.push({
            type: 'platform_start',
            position: currentPosition.clone(),
            size: this.options.platformSize.clone(),
            materialType: PLATFORM_MATERIAL_TYPE,
            // Specific visual properties for start platform if needed
            color: new THREE.Color(0x77ff77), // Greenish
        });

        for (let i = 0; i < this.options.numberOfPlatforms; i++) {
            const distance = THREE.MathUtils.randFloat(this.options.minPlatformDistance, this.options.maxPlatformDistance);
            const heightChange = THREE.MathUtils.randFloat(this.options.minHeightVariation, this.options.maxHeightVariation);

            // Randomize direction slightly
            const angleChange = THREE.MathUtils.randFloat(-this.options.maxAngleChange, this.options.maxAngleChange);
            const rotationAxis = new THREE.Vector3(0, 1, 0); // Rotate around Y-axis
            currentDirection.applyAxisAngle(rotationAxis, angleChange).normalize();

            const nextPlatformOffset = currentDirection.clone().multiplyScalar(distance);
            currentPosition.add(nextPlatformOffset);
            currentPosition.y += heightChange;

            // Basic safety net: prevent platforms from generating too far below the starting altitude,
            // making early parts of the level impossibly deep.
            if (currentPosition.y < this.options.startPosition.y - 20) {
                currentPosition.y = this.options.startPosition.y - 20;
            }


            this.levelObjects.push({
                type: 'platform',
                position: currentPosition.clone(),
                size: this.options.platformSize.clone().multiplyScalar(THREE.MathUtils.randFloat(0.8, 1.2)), // Slightly vary size
                materialType: PLATFORM_MATERIAL_TYPE,
                color: new THREE.Color().setHSL(Math.random(), 0.6, 0.7), // Randomish color
            });
        }

        // Create goal platform
        const goalDistance = THREE.MathUtils.randFloat(this.options.minPlatformDistance, this.options.maxPlatformDistance);
        const goalHeightChange = THREE.MathUtils.randFloat(this.options.minHeightVariation / 2, this.options.maxHeightVariation / 2);
        const goalOffset = currentDirection.clone().multiplyScalar(goalDistance);
        currentPosition.add(goalOffset);
        currentPosition.y += goalHeightChange;
        if (currentPosition.y < this.options.startPosition.y - 10) { // Ensure goal isn't too low
            currentPosition.y = this.options.startPosition.y - 10;
        }


        this.levelObjects.push({
            type: 'platform_goal',
            position: currentPosition.clone(),
            size: this.options.goalPlatformSize.clone(),
            materialType: PLATFORM_MATERIAL_TYPE,
            color: new THREE.Color(0xffdd55), // Gold/Yellow
            isGoal: true, // Special flag for the goal
        });

        return this.levelObjects;
    }

    // Helper to create actual THREE.Mesh objects if ObjectManager is not used directly
    // For this project, ObjectManager will handle mesh creation.
    // getMeshObjects(scene) {
    //     const meshes = [];
    //     this.levelObjects.forEach(objData => {
    //         const geometry = new THREE.BoxGeometry(objData.size.x, objData.size.y, objData.size.z);
    //         const material = new THREE.MeshPhongMaterial({ color: objData.color || 0xcccccc });
    //         const mesh = new THREE.Mesh(geometry, material);
    //         mesh.position.copy(objData.position);
    //         meshes.push(mesh);
    //         scene.add(mesh); // Or let the caller add them
    //     });
    //     return meshes;
    // }
}
