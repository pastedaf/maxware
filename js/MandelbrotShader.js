import * as THREE from 'three';

const MandelbrotShader = {
    uniforms: {
        'tDiffuse': { value: null }, // Input texture from previous pass
        'resolution': { value: new THREE.Vector2() },
        'time': { value: 0.0 },
        'zoom': { value: 1.0 },
        'panX': { value: -0.5 }, // Initial pan, usually around the main cardioid
        'panY': { value: 0.0 },
        'maxIterations': { value: 100 },
        'colorPaletteType': { value: 0 }, // 0: Grayscale, 1: Psychedelic Time, 2: Smooth Color
        'mixFactor': { value: 0.5 } // 0: tDiffuse, 1: Fractal
    },

    vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,

    fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform vec2 resolution;
        uniform float time;
        uniform float zoom;
        uniform float panX;
        uniform float panY;
        uniform int maxIterations;
        uniform int colorPaletteType;
        uniform float mixFactor;

        varying vec2 vUv;

        // Function to calculate Mandelbrot iterations
        int getMandelbrotIterations(vec2 c_in, int max_iter) {
            vec2 z = vec2(0.0, 0.0);
            int n = 0;
            // Loop with a high constant limit (GLSL requirement), but break early based on 'max_iter' uniform.
            for (int i = 0; i < 1000; i++) {
                if (i >= max_iter) break;

                z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c_in;
                if (dot(z, z) > 4.0) { // Check if magnitude squared > 4
                    break;
                }
                n++;
            }
            return n;
        }

        // Smooth iteration count for coloring
        float smoothIterations(vec2 c_in, int max_iter_smooth) {
            vec2 z = vec2(0.0, 0.0);
            float n = 0.0;
            // Loop with a high constant limit, but break early based on 'max_iter_smooth' uniform.
            for (int i = 0; i < 1000; i++) {
                 if (i >= max_iter_smooth) break;
                 z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c_in;
                 if (dot(z, z) > 4.0) break;
                 n += 1.0;
            }
            if (n < float(max_iter_smooth)) {
                // Smooth coloring formula based on log of magnitude
                // From https://iquilezles.org/www/articles/mandelbrot/mandelbrot.htm
                float log_zn = log(dot(z,z)) / 2.0;
                float nu = log(log_zn / log(2.0)) / log(2.0);
                n = n + 1.0 - nu;
            }
            return n;
        }


        vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
            return a + b * cos(6.28318 * (c * t + d));
        }

        void main() {
            vec2 uv = vUv;
            // Adjust UV to map to complex plane, considering aspect ratio
            float aspect = resolution.x / resolution.y;
            vec2 c = vec2((uv.x - 0.5) * zoom * aspect + panX, (uv.y - 0.5) * zoom + panY);

            vec3 fractalColor = vec3(0.0);

            if (colorPaletteType == 0) { // Grayscale
                int iterations = getMandelbrotIterations(c, maxIterations);
                float t = float(iterations) / float(maxIterations);
                fractalColor = vec3(t);
            } else if (colorPaletteType == 1) { // Psychedelic Time
                int iterations = getMandelbrotIterations(c, maxIterations);
                if (iterations < maxIterations) {
                    float t = float(iterations) / float(maxIterations);
                    fractalColor = palette(t + time * 0.1, vec3(0.5,0.5,0.5),vec3(0.5,0.5,0.5),vec3(1.0,1.0,1.0),vec3(0.0, 0.10, 0.20));
                } else {
                    fractalColor = vec3(0.0); // Inside set is black
                }
            } else if (colorPaletteType == 2) { // Smooth Color
                 float smIter = smoothIterations(c, maxIterations);
                 if (smIter < float(maxIterations)) {
                    float t = smIter / float(maxIterations); // Normalize
                    // Example smooth palette (can be anything)
                    fractalColor = palette(t * 0.1 + 0.5, vec3(0.8,0.5,0.4),vec3(0.2,0.4,0.2),vec3(2.0,1.0,1.0),vec3(0.0,0.25,0.25));
                 } else {
                    fractalColor = vec3(0.0);
                 }
            }


            vec4 originalColor = texture2D(tDiffuse, vUv);
            gl_FragColor = mix(originalColor, vec4(fractalColor, originalColor.a), mixFactor);
        }
    `
};

export { MandelbrotShader };
