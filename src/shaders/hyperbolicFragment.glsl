uniform vec3 objectColor;
uniform float diskRadius; // Visual radius of the Poincare disk (e.g., in NDC, 0.0 to 1.0)
uniform vec2 poincareCenterOffset; // Center of the disk in NDC

varying vec4 vWorldPosition; // If passed from vertex shader
varying vec2 vPoincareCoords; // If specific Poincare coordinates are passed

void main() {
    // To clip fragments outside the disk, we need to know their position relative to the disk center.
    // This is typically done in Normalized Device Coordinates (NDC) or screen space.
    // gl_FragCoord.xy gives window coordinates. We need to map this to NDC.
    // vec2 ndc = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0; // u_resolution would be a uniform for viewport size

    // However, clipping is more efficiently done using discard in the fragment shader based on some
    // coordinates calculated in the vertex shader and passed via varyings.

    // If vPoincareCoords (representing coordinates *within* the Poincare disk, e.g., after projection)
    // were passed from the vertex shader:
    // if (length(vPoincareCoords) > diskRadius) { // Assuming diskRadius is the radius in that vPoincareCoord space
    //     discard;
    // }

    // For a simpler visual clip based on final screen position (less performant for complex scenes):
    // This requires knowing the viewport resolution.
    // For now, let's assume the geometry is already shaped like a disk by the vertex shader
    // or by the mesh itself. The fragment shader just colors it.

    // A common technique is to use a discard based on some property.
    // For example, if the vertex shader transformed things such that anything outside the
    // disk gets a specific Z value or a specific varying flag.

    // If we want to make a circular boundary for objects that are otherwise square:
    // We need the fragment's position relative to the object's center in its local XY plane,
    // then check if it's within a radius. This requires passing local coordinates or UVs.

    // Given the current vertex shader is very basic and mostly scales,
    // this fragment shader will also be simple.
    // The "diskRadius" and "poincareCenterOffset" in the vertex shader are applied to vertices.
    // If we want to clip fragments to form a perfect circle *after* that vertex transformation,
    // we need to calculate the fragment's distance from the *transformed* center in screen space.

    // Let's just color the fragment. The actual "shape" of the hyperbolic space
    // is primarily defined by the vertex shader's transformations.
    gl_FragColor = vec4(objectColor, 1.0);

    // Example of how one might clip to a visual disk if gl_Position was unmodified Euclidean
    // and we wanted to draw a 2D circle mask. This is NOT for true hyperbolic rendering.
    // vec2 screen_uv = gl_FragCoord.xy / screenResolutionUniform; // screenResolutionUniform = vec2(width, height)
    // vec2 centered_uv = screen_uv - 0.5; // Center UVs
    // float dist_from_center = length(centered_uv * 2.0); // Now in range roughly 0-1 from center
    // if (dist_from_center > diskRadiusVisual) { // diskRadiusVisual could be 0.9 for 90% of screen
    //     discard;
    // }
}
