import * as THREE from 'three';

export class InteractionManager {
    /** @type {THREE.Camera} */
    camera;
    /** @type {THREE.Scene} */ // Or a specific list of interactive objects
    scene;
    /** @type {HTMLElement} */
    domElement;
    /** @type {THREE.Raycaster} */
    raycaster;
    /** @type {THREE.Vector2} */
    mouse;

    /** @type {Map<string, Array<(object: THREE.Object3D, event?: MouseEvent) => void>>} */
    eventListeners;

    /** @type {THREE.Object3D[]} */
    interactiveObjects;

    /** @type {THREE.Object3D | null} */
    hoveredObject = null;
    /** @type {THREE.Object3D | null} */
    draggedObject = null;
    /** @type {THREE.Plane} */
    dragPlane;
    /** @type {THREE.Vector3} */
    dragOffset; // Offset from object's origin to intersection point

    /**
     * @param {THREE.Camera} camera
     * @param {THREE.Scene} scene The scene containing interactive objects, or pass objects directly.
     * @param {HTMLElement} domElement The canvas element for mouse events.
     */
    constructor(camera, scene, domElement) {
        this.camera = camera;
        this.scene = scene;
        this.domElement = domElement;

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.eventListeners = new Map();
        this.interactiveObjects = [];

        this.dragPlane = new THREE.Plane();
        this.dragOffset = new THREE.Vector3();

        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        this._onClick = this._onClick.bind(this); // Keep click for non-drag interactions

        // Using pointer events for better compatibility with touch
        this.domElement.addEventListener('pointerdown', this._onPointerDown, false);
        this.domElement.addEventListener('pointermove', this._onPointerMove, false);
        this.domElement.addEventListener('pointerup', this._onPointerUp, false);
        this.domElement.addEventListener('click', this._onClick, false); // Clicks are often derived from pointerup
    }

    /**
     * @param {THREE.Object3D} object
     */
    addInteractiveObject(object) {
        if (!this.interactiveObjects.includes(object)) {
            this.interactiveObjects.push(object);
        }
    }

    /**
     * @param {THREE.Object3D} object
     */
    removeInteractiveObject(object) {
        const index = this.interactiveObjects.indexOf(object);
        if (index > -1) {
            this.interactiveObjects.splice(index, 1);
        }
    }

    /**
     * @param {'click' | 'hoverStart' | 'hoverEnd' | string} eventName
     * @param {(object: THREE.Object3D, event?: MouseEvent | PointerEvent) => void} callback
     */
    on(eventName, callback) {
        if (!this.eventListeners.has(eventName)) {
            this.eventListeners.set(eventName, []);
        }
        this.eventListeners.get(eventName)?.push(callback);
    }

    /**
     * @param {'click' | 'hoverStart' | 'hoverEnd' | string} eventName
     * @param {Function} callback
     */
    off(eventName, callback) {
        const listeners = this.eventListeners.get(eventName);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * @param {string} eventName
     * @param {THREE.Object3D} object
     * @param {MouseEvent | PointerEvent} [event]
     */
    _dispatchEvent(eventName, object, event) {
        const listeners = this.eventListeners.get(eventName);
        if (listeners) {
            listeners.forEach(listener => listener(object, event));
        }
    }

    /**
     * @param {PointerEvent} event
     */
    _onPointerDown(event) {
        // event.preventDefault(); // Only prevent default if we start a drag
        this._updateMousePosition(event);

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.interactiveObjects, true);

        if (intersects.length > 0) {
            const firstIntersectedObject = this._findRootInteractiveObject(intersects[0].object);
            if (firstIntersectedObject && firstIntersectedObject.userData.isDraggable !== false) { // Assume draggable unless specified
                event.preventDefault(); // Prevent text selection, etc.
                this.draggedObject = firstIntersectedObject;

                // Calculate plane for dragging: normal is camera's view direction, passes through intersection point
                // For more intuitive dragging, often a plane parallel to camera's near plane,
                // or a fixed horizontal/vertical plane is used.
                // Here, let's use a plane facing the camera and passing through the clicked point.
                const intersectionPoint = intersects[0].point;
                this.dragPlane.setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(this.dragPlane.normal).negate(), intersectionPoint);

                // Calculate offset from object's origin to the intersection point
                this.dragOffset.copy(intersectionPoint).sub(this.draggedObject.position);

                this.domElement.style.cursor = 'grabbing'; // Or 'move'
                this._dispatchEvent('dragStart', this.draggedObject, event);
            }
        }
    }

    /**
     * @param {PointerEvent} event
     */
    _onPointerMove(event) {
        event.preventDefault();
        this._updateMousePosition(event);

        if (this.draggedObject) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersection = new THREE.Vector3();
            if (this.raycaster.ray.intersectPlane(this.dragPlane, intersection)) {
                // Apply the offset so the object is grabbed at the point of click, not its origin
                const newPosition = intersection.sub(this.dragOffset);
                this.draggedObject.position.copy(newPosition);
                // If the object has a parent, its position is relative to the parent.
                // This simple position.copy assumes the object is a direct child of the scene or its parent's transformations are handled.
                // For nested objects, you might need to transform the intersection point to the parent's local space.
                // this.draggedObject.parent.worldToLocal(newPosition); this.draggedObject.position.copy(newPosition);

                this._dispatchEvent('drag', this.draggedObject, event);
            }
            return; // Don't process hover events while dragging
        }

        // Hover logic (similar to old _onMouseMove)
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.interactiveObjects, true);

        if (intersects.length > 0) {
            const firstIntersectedObject = this._findRootInteractiveObject(intersects[0].object);
            if (firstIntersectedObject) {
                if (this.hoveredObject !== firstIntersectedObject) {
                    if (this.hoveredObject) {
                        this._dispatchEvent('hoverEnd', this.hoveredObject, event);
                    }
                    this.hoveredObject = firstIntersectedObject;
                    this.domElement.style.cursor = 'pointer';
                    this._dispatchEvent('hoverStart', this.hoveredObject, event);
                }
            }
        } else {
            if (this.hoveredObject) {
                this._dispatchEvent('hoverEnd', this.hoveredObject, event);
                this.hoveredObject = null;
                this.domElement.style.cursor = 'default';
            }
        }
    }

    /**
     * @param {PointerEvent} event
     */
    _onPointerUp(event) {
        event.preventDefault();
        if (this.draggedObject) {
            this._dispatchEvent('dragEnd', this.draggedObject, event);
            this.draggedObject = null;
            this.domElement.style.cursor = this.hoveredObject ? 'pointer' : 'default';
        }
    }

    /**
     * @param {MouseEvent} event // Keep distinct click for simple interactions
     */
    _onClick(event) {
        // Click is typically fired on pointerup if no drag occurred.
        // We can make this more robust by checking if a drag happened.
        // For simplicity, we'll let it fire if a draggedObject wasn't active *at the moment of up*.
        // A more sophisticated approach involves checking movement threshold between down and up.

        if (this.draggedObject) return; // If a drag operation was in progress and just ended, don't also fire click.

        this._updateMousePosition(event); // Ensure mouse coords are fresh for raycasting
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.interactiveObjects, true);

        if (intersects.length > 0) {
             const firstIntersectedObject = this._findRootInteractiveObject(intersects[0].object);
             if(firstIntersectedObject){
                this._dispatchEvent('click', firstIntersectedObject, event);
             }
        }
    }

    /**
     * @param {MouseEvent | PointerEvent} event
     */
    _updateMousePosition(event) {
        const rect = this.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    /**
     * Helper to find the root object that was added as interactive,
     * in case the intersection is with a child mesh.
     * @param {THREE.Object3D} intersectedChild
     * @returns {THREE.Object3D | null}
     */
    _findRootInteractiveObject(intersectedChild) {
        let currentObject = intersectedChild;
        while (currentObject) {
            if (this.interactiveObjects.includes(currentObject)) {
                return currentObject;
            }
            if (!currentObject.parent || currentObject.parent === this.scene) {
                // Stop if we hit the scene or an object with no parent that isn't interactive itself
                return null;
            }
            currentObject = currentObject.parent;
        }
        return null; // Should not be reached if objects are direct children or part of a group added.
    }


    // Update method, if needed for continuous interactions (e.g., drag)
    update() {
        // Currently, interactions are event-driven.
        // This could be used for things like updating drag states.
    }

    dispose() {
        this.domElement.removeEventListener('pointerdown', this._onPointerDown);
        this.domElement.removeEventListener('pointermove', this._onPointerMove);
        this.domElement.removeEventListener('pointerup', this._onPointerUp);
        this.domElement.removeEventListener('click', this._onClick);

        this.eventListeners.clear();
        this.interactiveObjects = [];
        this.hoveredObject = null;
        this.draggedObject = null;
        this.domElement.style.cursor = 'default';
    }
}
