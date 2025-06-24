import * as THREE from 'three';

const DEFAULTS = {
    playerHeight: 1.8,
    playerRadius: 0.5, // For collision cylinder
    gravity: -30, // m/s^2
    moveSpeed: 8, // m/s - Base speed, acceleration handles actual speed build-up
    acceleration: 60, // m/s^2 for ground
    airAcceleration: 30, // m/s^2 for air control (airstrafing)
    friction: 10, // Coefficient for ground friction
    airFriction: 0.98, // Multiplier for air resistance per frame (closer to 1 = less friction) - this will be applied differently
    bhopSpeedGain: 1.05, // Multiplier for speed gain on perfect bhop
    bhopSpeedCap: 35, // Max speed achievable via bhopping
    jumpForce: 9, // m/s
    maxSpeed: 20, // m/s (general horizontal speed cap, bhop can exceed)
    maxFallSpeed: 55, // m/s
    lookSpeed: 2.0, // Radians per second per mouse pixel delta (approx)
    maxSlopeAngle: Math.PI / 3, // Max angle of slope player can walk up (60 degrees)
    // Grapple constants
    grappleMaxDistance: 50,
    grapplePullSpeed: 20, // Speed towards grapple point when pulling
    grappleSwingForce: 50, // Force applied for swinging
    grappleRetractSpeed: 100, // Speed at which hook returns if miss or detach
};

export class PlayerController {
    constructor(camera, domElement, scene, initialPosition = new THREE.Vector3(0, DEFAULTS.playerHeight, 0)) { // Added scene
        this.camera = camera;
        this.domElement = domElement;
        this.scene = scene; // Store scene reference for grapple line

        this.playerHeight = DEFAULTS.playerHeight;
        this.playerRadius = DEFAULTS.playerRadius;

        this.velocity = new THREE.Vector3();
        this.position = initialPosition.clone();
        this.camera.position.copy(this.position);
        this.camera.position.y += this.playerHeight / 2; // Camera roughly at eye level

        this.pitch = 0; // Vertical rotation (look up/down)
        this.yaw = 0;   // Horizontal rotation (look left/right)

        this.onGround = false;
        this.wasOnGround = false; // For bhop detection
        this.jumping = false;
        this.justJumped = false; // To prevent immediate re-grounding

        // Movement state
        this.moveState = {
            forward: 0,  // -1 for backward, 1 for forward
            right: 0,    // -1 for left, 1 for right
            jump: false,
            grapple: false
        };

        // Grapple state
        this.grappling = false;
        this.grapplePoint = new THREE.Vector3();
        this.grappleObject = null;
        this.grappleLine = null;
        this.grappleRaycaster = new THREE.Raycaster();
        this.grappleHookPosition = new THREE.Vector3(); // Current position of the hook mesh/tip
        this.grappleState = 'idle'; // 'idle', 'firing', 'attached', 'retracting'
        this.currentGrappleLength = 0;


        // Collision objects (will be populated from outside)
        this.collidables = [];

        this._addEventListeners();
        this._setupPointerLock();
        this._initGrappleVisual();
    }

    _addEventListeners() {
        document.addEventListener('keydown', this._onKeyDown.bind(this));
        document.addEventListener('keyup', this._onKeyUp.bind(this));
        // Using mousedown/mouseup for grapple to allow holding
        this.domElement.ownerDocument.addEventListener('mousedown', this._onMouseDown.bind(this));
        this.domElement.ownerDocument.addEventListener('mouseup', this._onMouseUp.bind(this));
    }

    _onKeyDown(event) {
        if (!this.isLocked) return;
        switch (event.code) {
            case 'KeyW': this.moveState.forward = 1; break;
            case 'KeyS': this.moveState.forward = -1; break;
            case 'KeyA': this.moveState.right = -1; break;
            case 'KeyD': this.moveState.right = 1; break;
            case 'Space': this.moveState.jump = true; break;
            // Grapple is handled by mouse down/up
        }
    }

    _onKeyUp(event) {
        if (!this.isLocked) return;
        switch (event.code) {
            case 'KeyW': if (this.moveState.forward === 1) this.moveState.forward = 0; break;
            case 'KeyS': if (this.moveState.forward === -1) this.moveState.forward = 0; break;
            case 'KeyA': if (this.moveState.right === -1) this.moveState.right = 0; break;
            case 'KeyD': if (this.moveState.right === 1) this.moveState.right = 0; break;
            case 'Space': this.moveState.jump = false; this.jumping = false; break;
        }
    }

    _onMouseDown(event) {
        if (!this.isLocked) return;
        if (event.button === 0) { // Left mouse button for grapple
            this.moveState.grapple = true;
            this._fireGrapple();
        }
    }

    _onMouseUp(event) {
        if (!this.isLocked) return;
        if (event.button === 0) { // Left mouse button
            this.moveState.grapple = false;
            this._releaseGrapple();
        }
    }


    _initGrappleVisual() {
        const material = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
        const points = [];
        points.push(new THREE.Vector3(0, 0, 0)); // Start point (player hand/camera)
        points.push(new THREE.Vector3(0, 0, 0)); // End point (grapple hook tip)
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        this.grappleLine = new THREE.LineSegments(geometry, material);
        this.grappleLine.visible = false;
        this.scene.add(this.grappleLine);
    }

    _setupPointerLock() {
        this.isLocked = false;
        this.domElement.ownerDocument.addEventListener('mousemove', this._onMouseMove.bind(this));
        this.domElement.ownerDocument.addEventListener('pointerlockchange', this._onPointerLockChange.bind(this));
        this.domElement.ownerDocument.addEventListener('pointerlockerror', this._onPointerLockError.bind(this));

        this.domElement.addEventListener('click', () => {
            this.domElement.requestPointerLock();
        });

        // Instructions
        this.instructions = document.getElementById('instructions'); // Assuming it exists
        if (!this.instructions) {
            this.instructions = document.createElement('div');
            this.instructions.id = 'instructions-player';
            this.instructions.style.cssText = `
                position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                color: white; font-size: 24px; text-align: center;
                background-color: rgba(0,0,0,0.7); padding: 20px; cursor: pointer;
            `;
            this.instructions.innerHTML = 'Click to Play<br>(W,A,S,D = Move, SPACE = Jump, MOUSE = Look)';
            this.domElement.ownerDocument.body.appendChild(this.instructions);
        }
    }

    _onMouseMove(event) {
        if (!this.isLocked) return;

        const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
        const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

        this.yaw -= movementX * 0.001 * DEFAULTS.lookSpeed;
        this.pitch -= movementY * 0.001 * DEFAULTS.lookSpeed;
        this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch)); // Clamp pitch
    }

    _onPointerLockChange() {
        if (this.domElement.ownerDocument.pointerLockElement === this.domElement) {
            this.isLocked = true;
            if (this.instructions) this.instructions.style.display = 'none';
            // Also hide the main GUI if it exists
            const guiContainer = document.getElementById('gui-container');
            if (guiContainer) guiContainer.style.display = 'none';
        } else {
            this.isLocked = false;
            if (this.instructions) this.instructions.style.display = 'block';
            const guiContainer = document.getElementById('gui-container');
            if (guiContainer) guiContainer.style.display = 'block';
        }
    }

    _onPointerLockError() {
        console.error('PlayerController: PointerLockError.');
        if (this.instructions) this.instructions.style.display = 'block'; // Show instructions on error
    }

    setCollidables(collidableMeshes) {
        this.collidables = collidableMeshes.map(mesh => {
            // Ensure bounding box is computed and up-to-date
            if (!mesh.geometry.boundingBox) {
                mesh.geometry.computeBoundingBox();
            }
            // It's better to work with world-transformed AABBs for collision
            const box = new THREE.Box3().setFromObject(mesh);
            return { mesh, box };
        });
    }

    update(deltaTime) {
        if (!this.isLocked && this.onGround) { // Don't apply physics updates if not locked and on ground
             this.velocity.x = 0;
             this.velocity.z = 0;
             // Potentially allow camera updates even if not locked, but no movement.
             this._updateCamera();
             return;
        }
        if (deltaTime > 0.1) deltaTime = 0.1; // Prevent large jumps in time

        const oldVelocity = this.velocity.clone();
        const oldPosition = this.position.clone();
        this.wasOnGround = this.onGround; // Store previous ground state for bhop logic

        // --- Update Grapple State and Physics ---
        this._updateGrapple(deltaTime);


        // --- Apply Gravity (conditional based on grapple) ---
        if (!this.grappling || this.grappleState !== 'attached') {
            this.velocity.y += DEFAULTS.gravity * deltaTime;
            this.velocity.y = Math.max(this.velocity.y, -DEFAULTS.maxFallSpeed); // Terminal velocity
        } else if (this.grappleState === 'attached') {
            // Apply swinging physics or pulling logic, gravity might be less effective or counteracted
            // This will be handled in _updateGrapple or a dedicated swing physics function
        }


        // --- Handle Jumping (only if not grappling) ---
        if (this.moveState.jump && this.onGround && !this.jumping) {
            this.velocity.y = DEFAULTS.jumpForce;
            this.onGround = false; // Player leaves the ground
            this.jumping = true;   // Player is in the act of jumping
            this.justJumped = true;
            setTimeout(() => this.justJumped = false, 100);

            // Bhop speed gain logic
            if (this.wasOnGround) { // Check if player was on ground last frame (prevents gain on first jump)
                const horizontalSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
                if (horizontalSpeed > DEFAULTS.moveSpeed * 0.8) { // Only apply if moving with some speed
                    this.velocity.x *= DEFAULTS.bhopSpeedGain;
                    this.velocity.z *= DEFAULTS.bhopSpeedGain;
                }
            }
        }

        // --- Calculate Movement Direction ---
        const forwardDirection = new THREE.Vector3();
        this.camera.getWorldDirection(forwardDirection);
        forwardDirection.y = 0; // Project onto XZ plane
        forwardDirection.normalize();

        const rightDirection = new THREE.Vector3().crossVectors(this.camera.up, forwardDirection).normalize();
        rightDirection.y = 0;
        rightDirection.normalize();


        const wishDir = new THREE.Vector3();
        if (this.moveState.forward !== 0) {
            wishDir.addScaledVector(forwardDirection, this.moveState.forward);
        }
        if (this.moveState.right !== 0) {
            wishDir.addScaledVector(rightDirection, this.moveState.right);
        }
        wishDir.normalize(); // Ensure consistent speed when moving diagonally

        // --- Apply Ground/Air Friction & Acceleration ---
        if (this.onGround) {
            // Apply friction
            const speed = this.velocity.length();
            if (speed > 0.01) { // Only apply friction if moving
                const drop = speed * DEFAULTS.friction * deltaTime;
                const frictionScale = Math.max(0, (speed - drop) / speed);
                this.velocity.x *= frictionScale;
                this.velocity.z *= frictionScale;
            } else {
                this.velocity.x = 0;
                this.velocity.z = 0;
            }
            // Apply acceleration
            this.velocity.x += wishDir.x * DEFAULTS.acceleration * deltaTime;
            this.velocity.z += wishDir.z * DEFAULTS.acceleration * deltaTime;

        } else { // In Air - Airstrafing logic
            // Airstrafing allows players to gain speed by moving mouse while holding strafe keys.
            // This implementation is a common simplified approach.
            const currentSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
            const wishSpeed = DEFAULTS.moveSpeed; // Target speed for air acceleration component

            // Project current velocity onto wishDir vector to see how much speed we have in the direction of movement.
            const currentSpeedInWishDir = this.velocity.x * wishDir.x + this.velocity.z * wishDir.z;

            // Calculate speed to add (difference between desired and current in that direction)
            let addSpeed = wishSpeed - currentSpeedInWishDir;
            if (addSpeed <= 0) { // No acceleration if already moving faster than wishSpeed in wishDir
                addSpeed = 0;
            }

            // Calculate acceleration amount, capped by airAcceleration and deltaTime
            let accelAmount = DEFAULTS.airAcceleration * wishSpeed * deltaTime;
            if (accelAmount > addSpeed) {
                accelAmount = addSpeed;
            }

            this.velocity.x += wishDir.x * accelAmount;
            this.velocity.z += wishDir.z * accelAmount;

            // Simplified air friction (applied constantly, could be more complex)
            // This is a basic drag, not the Quake-style air friction that allows speed build-up
            // For true Quake-style airstrafing, friction is often minimal or handled implicitly
            // by the acceleration model. We'll use a light drag for now.
            this.velocity.x *= DEFAULTS.airFriction; // Applied per frame, so needs to be close to 1
            this.velocity.z *= DEFAULTS.airFriction;
        }

        // --- Clamp Speed (overall and bhop specific) ---
        let currentMaxSpeed = this.onGround ? DEFAULTS.maxSpeed : DEFAULTS.bhopSpeedCap;
        const horizontalSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);

        if (horizontalSpeed > currentMaxSpeed) {
            const factor = currentMaxSpeed / horizontalSpeed;
            this.velocity.x *= factor;
            this.velocity.z *= factor;
        }


        // --- Update Position based on Velocity ---
        const deltaPosition = this.velocity.clone().multiplyScalar(deltaTime);
        this.position.add(deltaPosition);


        // --- Collision Detection & Response ---
        this.onGround = false; // Assume not on ground until collision check proves otherwise
        const playerSphere = new THREE.Sphere(this.position.clone().add(new THREE.Vector3(0, this.playerRadius - this.playerHeight / 2, 0)), this.playerRadius);
        const playerCapsuleBottom = this.position.clone().setY(this.position.y - this.playerHeight / 2 + this.playerRadius);
        const playerCapsuleTop = this.position.clone().setY(this.position.y + this.playerHeight / 2 - this.playerRadius);
        const playerCapsule = new THREE.Line3(playerCapsuleBottom, playerCapsuleTop);


        for (const collidable of this.collidables) {
            const box = collidable.box; // World-transformed AABB

            // Check for ground collision (simplified: player base vs top of box)
            // Player base Y position
            const playerBaseY = this.position.y - this.playerHeight / 2;

            if (this.position.x + this.playerRadius > box.min.x &&
                this.position.x - this.playerRadius < box.max.x &&
                this.position.z + this.playerRadius > box.min.z &&
                this.position.z - this.playerRadius < box.max.z) {

                // Potential vertical collision (on top or hitting from below)
                if (this.velocity.y <= 0 && // Moving downwards or standing still
                    playerBaseY >= box.min.y && // Old base position was above or at box min y
                    playerBaseY <= box.max.y + 0.1 && // New base position is at or slightly below box max y (0.1 buffer)
                    !this.justJumped) {

                    // Check if player was above the box in the previous frame
                    const oldPlayerBaseY = oldPosition.y - this.playerHeight / 2;
                    if (oldPlayerBaseY >= box.max.y - 0.01) { // Allow very small penetration before resolving
                        this.position.y = box.max.y + this.playerHeight / 2;
                        this.velocity.y = 0;
                        this.onGround = true;
                        this.jumping = false;
                    }
                }
            }


            // More general capsule vs AABB collision (for walls, etc.)
            const tempVec = new THREE.Vector3();
            const closestPointInBox = new THREE.Vector3();
            closestPointInBox.copy(this.position).clamp(box.min, box.max); // Closest point on/in box to player center

            const segment = playerCapsule;
            const closestPointOnSegment = new THREE.Vector3();
            segment.closestPointToPoint(closestPointInBox, true, closestPointOnSegment);

            const penetrationDepth = new THREE.Vector3().subVectors(closestPointOnSegment, closestPointInBox);
            const distance = penetrationDepth.length();

            if (distance < this.playerRadius) {
                const normal = penetrationDepth.normalize(); // Normal pointing from box to player
                const resolve = normal.multiplyScalar(this.playerRadius - distance);
                this.position.add(resolve);

                // Adjust velocity based on collision normal
                // Reflect velocity component along the normal, dampening it
                const velocityComponentNormal = this.velocity.dot(normal);
                if (velocityComponentNormal < 0) { // Moving towards the wall
                    const restitution = 0.1; // How bouncy, 0 = no bounce
                    this.velocity.addScaledVector(normal, -velocityComponentNormal * (1 + restitution));

                    // If it's a steep wall and we are on ground, it might be a slope we can't climb
                    if (this.onGround && normal.y < Math.sin(DEFAULTS.maxSlopeAngle)) {
                        // Try to slide along the wall
                        const slideDirection = new THREE.Vector3(this.velocity.x, 0, this.velocity.z).normalize();
                        const wallTangent = new THREE.Vector3().crossVectors(normal, this.camera.up).normalize();
                        if (slideDirection.dot(wallTangent) < 0) wallTangent.negate();

                        const slideSpeed = Math.sqrt(this.velocity.x**2 + this.velocity.z**2);
                        this.velocity.x = wallTangent.x * slideSpeed * 0.8; // Reduce speed a bit when sliding
                        this.velocity.z = wallTangent.z * slideSpeed * 0.8;
                    }
                }
            }
        }


        // --- Update Camera ---
        this._updateCamera();
    }

    _updateCamera() {
        // Update camera position to match player's base + height
        this.camera.position.copy(this.position);
        // this.camera.position.y += this.playerHeight / 2; // Camera at eye level for capsule

        // Apply rotation
        const quaternion = new THREE.Quaternion();
        this.camera.quaternion.setFromEuler(new THREE.Euler(0, this.yaw, 0, 'YXZ')); // Yaw first
        quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch); // Then pitch
        this.camera.quaternion.multiply(quaternion);

        // Update grapple line visual
        this._updateGrappleLineVisual();
    }

    _fireGrapple() {
        if (this.grappleState !== 'idle') return; // Can only fire if idle

        const rayOrigin = new THREE.Vector3();
        this.camera.getWorldPosition(rayOrigin);
        const rayDirection = new THREE.Vector3();
        this.camera.getWorldDirection(rayDirection);

        this.grappleRaycaster.set(rayOrigin, rayDirection);
        this.grappleRaycaster.far = DEFAULTS.grappleMaxDistance;

        const intersects = this.grappleRaycaster.intersectObjects(this.collidables.map(c => c.mesh), false);

        if (intersects.length > 0) {
            const intersection = intersects[0];
            // Check if the intersected object is one of our collidables (it should be)
            const collidableObject = this.collidables.find(c => c.mesh === intersection.object);
            if (collidableObject) {
                this.grappleState = 'firing';
                this.grapplePoint.copy(intersection.point);
                this.grappleObject = collidableObject.mesh; // Store the mesh itself
                this.grappleHookPosition.copy(rayOrigin); // Hook starts at player
                this.grappling = true; // General flag indicating grapple is active
                this.grappleLine.visible = true;
                // console.log("Grapple Fired! Target:", this.grapplePoint); // Debug
            }
        } else {
            // Missed - can add a sound or visual cue later
            // console.log("Grapple Missed!"); // Debug
            // Optionally, fire a short retracting hook even on miss for visual feedback
            this.grappleState = 'retracting'; // Or a specific 'miss_retracting'
            this.grapplePoint.copy(rayOrigin).addScaledVector(rayDirection, DEFAULTS.grappleMaxDistance / 2); // Retract from a point halfway
            this.grappleHookPosition.copy(rayOrigin);
            this.grappleLine.visible = true;
        }
    }

    _updateGrapple(deltaTime) {
        const playerHandPosition = new THREE.Vector3();
        this.camera.getWorldPosition(playerHandPosition); // Or a dedicated hand offset from camera

        if (this.grappleState === 'firing') {
            const directionToTarget = new THREE.Vector3().subVectors(this.grapplePoint, this.grappleHookPosition);
            const distanceToTarget = directionToTarget.length();
            const moveDistance = DEFAULTS.grappleRetractSpeed * 2 * deltaTime; // Faster firing speed

            if (distanceToTarget <= moveDistance) {
                this.grappleHookPosition.copy(this.grapplePoint);
                this.grappleState = 'attached';
                this.currentGrappleLength = this.position.distanceTo(this.grapplePoint);
                this.onGround = false; // Player is lifted off ground when grapple attaches
                // Potentially kill some vertical velocity to make attachment feel more impactful
                if (this.velocity.y < 0) this.velocity.y *= 0.3;

            } else {
                this.grappleHookPosition.addScaledVector(directionToTarget.normalize(), moveDistance);
            }
        } else if (this.grappleState === 'attached') {
            if (!this.moveState.grapple) { // If mouse button released
                this._releaseGrapple();
                return;
            }

            // Swinging / Pulling Physics
            const directionToGrapplePoint = new THREE.Vector3().subVectors(this.grapplePoint, this.position);
            const distanceToGrapple = directionToGrapplePoint.length();
            directionToGrapplePoint.normalize();

            // Maintain grapple length (spring-like force or direct velocity adjustment)
            const lengthDifference = distanceToGrapple - this.currentGrappleLength;

            // Pull player towards grapple point if too far, or if actively pulling
            // Simple pull:
            // this.velocity.addScaledVector(directionToGrapplePoint, DEFAULTS.grapplePullSpeed * deltaTime);

            // More complex swing:
            // Apply force towards grapple point to maintain rope tension (acts like a spring)
            // The 0.1 multiplier for lengthDifference is arbitrary, adjust for desired stiffness/feel.
            const tensionForceMagnitude = DEFAULTS.grappleSwingForce * lengthDifference * 0.1;
            const tensionForce = directionToGrapplePoint.clone().multiplyScalar(tensionForceMagnitude);
            this.velocity.addScaledVector(tensionForce, deltaTime);


            // Dampen velocity perpendicular to the grapple rope to simulate rope drag / control swing.
            // This prevents the player from orbiting too wildly.
            const perpendicularVelocity = this.velocity.clone().projectOnPlane(directionToGrapplePoint);
            this.velocity.sub(perpendicularVelocity.multiplyScalar(0.05 * deltaTime)); // Small damping factor, adjust for feel.


            // Allow player input (W/A/S/D) to influence swing direction.
            const forwardDirection = new THREE.Vector3();
            this.camera.getWorldDirection(forwardDirection);
            forwardDirection.y = 0;
            forwardDirection.normalize();
            const rightDirection = new THREE.Vector3().crossVectors(this.camera.up, forwardDirection).normalize();

            const swingInfluence = new THREE.Vector3();
            if (this.moveState.forward) {
                swingInfluence.addScaledVector(forwardDirection, this.moveState.forward * 0.5); // Less influence while swinging
            }
            if (this.moveState.right) {
                swingInfluence.addScaledVector(rightDirection, this.moveState.right * 0.5);
            }
            this.velocity.addScaledVector(swingInfluence.normalize(), DEFAULTS.airAcceleration * 0.5 * deltaTime);


            // Prevent passing through grapple point (basic)
            if (distanceToGrapple < this.playerRadius) {
                 this.position.copy(this.grapplePoint).addScaledVector(directionToGrapplePoint, -this.playerRadius);
                 // Optionally detach or handle collision with grapple object more gracefully
            }
             // Update grapple hook position to be the fixed grapple point
            this.grappleHookPosition.copy(this.grapplePoint);


        } else if (this.grappleState === 'retracting') {
            const directionToPlayer = new THREE.Vector3().subVectors(playerHandPosition, this.grappleHookPosition);
            const distanceToPlayer = directionToPlayer.length();
            const moveDistance = DEFAULTS.grappleRetractSpeed * deltaTime;

            if (distanceToPlayer <= moveDistance) {
                this._resetGrappleState();
            } else {
                this.grappleHookPosition.addScaledVector(directionToPlayer.normalize(), moveDistance);
            }
        }
    }

    _releaseGrapple() {
        if (this.grappleState === 'attached' || this.grappleState === 'firing') {
            this.grappleState = 'retracting';
            this.grappling = false; // General flag
            // Keep line visible while retracting
        }
    }

    _resetGrappleState() {
        this.grappling = false;
        this.grappleState = 'idle';
        this.grappleObject = null;
        this.grappleLine.visible = false;
        this.currentGrappleLength = 0;
    }


    _updateGrappleLineVisual() {
        if (this.grappleLine && this.grappleLine.visible) {
            const positions = this.grappleLine.geometry.attributes.position;
            const playerHandPosition = new THREE.Vector3();
            // Get a position slightly in front of the camera for the line start
            this.camera.getWorldPosition(playerHandPosition);
            const forward = new THREE.Vector3();
            this.camera.getWorldDirection(forward);
            playerHandPosition.addScaledVector(forward, 0.2); // Offset slightly forward
            playerHandPosition.y -= 0.1; // Offset slightly down to simulate hand

            positions.setXYZ(0, playerHandPosition.x, playerHandPosition.y, playerHandPosition.z);
            positions.setXYZ(1, this.grappleHookPosition.x, this.grappleHookPosition.y, this.grappleHookPosition.z);
            positions.needsUpdate = true;
            this.grappleLine.geometry.computeBoundingSphere(); // Important for visibility checks
        }
    }


    // Public method to get player's current position
    getPosition() {
        return this.position.clone();
    }

    // Public method to get player's current velocity
    getVelocity() {
        return this.velocity.clone();
    }

    // Public method to set player's position
    setPosition(x, y, z) {
        this.position.set(x,y,z);
        this.velocity.set(0,0,0); // Reset velocity on teleport
        this._updateCamera();
    }

    dispose() {
        document.removeEventListener('keydown', this._onKeyDown.bind(this));
        document.removeEventListener('keyup', this._onKeyUp.bind(this));
        this.domElement.ownerDocument.removeEventListener('mousemove', this._onMouseMove.bind(this));
        this.domElement.ownerDocument.removeEventListener('pointerlockchange', this._onPointerLockChange.bind(this));
        this.domElement.ownerDocument.removeEventListener('pointerlockerror', this._onPointerLockError.bind(this));
        if (this.instructions && this.instructions.parentElement) {
            this.instructions.parentElement.removeChild(this.instructions);
        }
        if (this.domElement.ownerDocument.pointerLockElement === this.domElement) {
            this.domElement.ownerDocument.exitPointerLock();
        }
    }
}
